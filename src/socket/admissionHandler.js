const { 
  validateClassAccess, 
  addStudentToWaitingRoom, 
  removeStudentFromWaitingRoom, 
  getWaitingStudents 
} = require('../services/admission.service');

module.exports = (io, socket) => {
  // Identity ALWAYS from authenticated socket
  const uid  = socket.userId;
  const role = socket.userRole;
  const name = socket.userName;

  // ── Student requests to join a class ───────────────────────────────────────
  socket.on('class:join-request', async (payload) => {
    try {
      // Only roomId comes from payload; identity from socket
      const { roomId } = payload;
      
      const validation = await validateClassAccess(uid, role, roomId);
      
      if (!validation.valid) {
        return socket.emit('class:rejected', { message: validation.message });
      }

      // Faculty — admit immediately
      if (validation.isTeacher) {
        socket.join(roomId);
        socket.emit('class:admitted');
        return;
      }

      // Check if already admitted (e.g. page refresh)
      const { redisClient } = require('../config/redis');
      const isAdmitted = await redisClient.sIsMember(`admitted:${roomId}`, uid);
      if (isAdmitted) {
        socket.join(`waiting:${roomId}`);
        socket.emit('class:admitted');
        return;
      }

      // Student: add to waiting room using socket-verified identity
      const studentData = { userId: uid, name, socketId: socket.id, role };
      await addStudentToWaitingRoom(roomId, studentData);

      console.log(`[Admission] join-request received roomId: ${roomId} userId: ${uid}`);
      console.log(`[Admission] waiting state stored`);

      socket.waitingRoomId  = roomId;
      socket.waitingUserId  = uid;

      socket.join(`waiting:${roomId}`);
      socket.emit('class:waiting-room-joined');

      // Notify faculty
      io.to(roomId).emit('class:waiting-student', studentData);
      console.log(`[Admission] waiting student event emitted roomId: ${roomId}`);
    } catch (err) {
      console.error('[Admission] join-request error:', err.message);
      socket.emit('class:rejected', { message: 'Server error during admission' });
    }
  });

  // ── Faculty fetches current waiting list (e.g. on reconnect) ──────────────
  socket.on('class:get-waiting-students', async (payload) => {
    try {
      const { roomId } = payload;
      const validation = await validateClassAccess(uid, role, roomId);
      
      if (!validation.valid || !validation.isTeacher) return;

      const waitingStudents = await getWaitingStudents(roomId);
      socket.emit('class:waiting-students-list', waitingStudents);
    } catch (err) {
      console.error('[Admission] get-waiting-students error:', err.message);
    }
  });

  // ── Faculty admits a student ───────────────────────────────────────────────
  socket.on('class:admit-student', async (payload) => {
    try {
      const { roomId, targetUserId } = payload;
      // Authorisation: use socket.userId (faculty), not payload.facultyId
      const validation = await validateClassAccess(uid, role, roomId);
      
      if (!validation.valid || !validation.isTeacher) return;

      const waitingStudents = await getWaitingStudents(roomId);
      const student = waitingStudents.find(s => s.userId === targetUserId);
      
      if (student) {
        await removeStudentFromWaitingRoom(roomId, targetUserId);
        
        const { redisClient } = require('../config/redis');
        await redisClient.sAdd(`admitted:${roomId}`, targetUserId.toString());
        await redisClient.expire(`admitted:${roomId}`, 4 * 3600);

        io.to(student.socketId).emit('class:admitted');
        io.to(roomId).emit('class:student-left-waiting', { userId: targetUserId });

        console.log(`[Admission] admitted user=${targetUserId} by faculty=${uid} room=${roomId}`);
      }
    } catch (err) {
      console.error('[Admission] admit-student error:', err.message);
    }
  });

  // ── Faculty rejects a student ──────────────────────────────────────────────
  socket.on('class:reject-student', async (payload) => {
    try {
      const { roomId, targetUserId } = payload;
      const validation = await validateClassAccess(uid, role, roomId);
      
      if (!validation.valid || !validation.isTeacher) return;

      const waitingStudents = await getWaitingStudents(roomId);
      const student = waitingStudents.find(s => s.userId === targetUserId);
      
      if (student) {
        await removeStudentFromWaitingRoom(roomId, targetUserId);
        io.to(student.socketId).emit('class:rejected', { message: 'Your request to join was not approved.' });
        io.to(roomId).emit('class:student-left-waiting', { userId: targetUserId });

        console.log(`[Admission] rejected user=${targetUserId} by faculty=${uid} room=${roomId}`);
      }
    } catch (err) {
      console.error('[Admission] reject-student error:', err.message);
    }
  });

  // ── Cleanup: student disconnects while waiting ─────────────────────────────
  socket.on('disconnect', async () => {
    if (socket.waitingRoomId && socket.waitingUserId) {
      try {
        await removeStudentFromWaitingRoom(socket.waitingRoomId, socket.waitingUserId);
        io.to(socket.waitingRoomId).emit('class:student-left-waiting', { userId: socket.waitingUserId });
      } catch (err) {
        console.error('[Admission] disconnect cleanup error:', err.message);
      }
    }
  });
};
