const { 
  validateClassAccess, 
  addStudentToWaitingRoom, 
  removeStudentFromWaitingRoom, 
  getWaitingStudents 
} = require('../services/admission.service');
const Attendance = require('../models/Attendance.model');

const recordStudentAttendance = async (roomId, studentId) => {
  try {
    await Attendance.findOneAndUpdate(
      { liveClass: roomId, student: studentId },
      {
        $setOnInsert: {
          liveClass: roomId,
          student: studentId,
          joinTime: new Date(),
          status: 'Present',
          provider: 'webrtc'
        },
        $push: {
          joinSessions: { joinTime: new Date() }
        }
      },
      { upsert: true, new: true }
    );
    console.log(`[ADMISSION] Attendance tracked for student=${studentId} in room=${roomId}`);
  } catch (err) {
    console.error(`[ADMISSION] Failed to record attendance for student=${studentId}:`, err.message);
  }
};

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
        recordStudentAttendance(roomId, uid);
        return;
      }

      // Student: add to waiting room using socket-verified identity
      const studentData = { userId: uid, name, socketId: socket.id, role };
      await addStudentToWaitingRoom(roomId, studentData);

      console.log(`[ADMISSION] class:join-request received userId=${uid} roomId=${roomId} role=${role}`);
      console.log(`[ADMISSION] waiting state stored key=waiting-room:${roomId}:${uid} userId=${uid} roomId=${roomId}`);

      socket.waitingRoomId  = roomId;
      socket.waitingUserId  = uid;

      socket.join(`waiting:${roomId}`);
      socket.emit('class:waiting-room-joined');

      // Notify faculty
      const roomClients = io.sockets.adapter.rooms.get(roomId);
      const socketCount = roomClients ? roomClients.size : 0;
      io.to(roomId).emit('class:waiting-student', studentData);
      console.log(`[ADMISSION] emitting class:waiting-student roomId=${roomId} socket count in room=${socketCount}`);
    } catch (err) {
      console.error('[Admission] join-request error:', err.message);
      socket.emit('class:rejected', { message: 'Server error during admission' });
    }
  });

  // ── Faculty fetches current waiting list (e.g. on reconnect) ──────────────
  socket.on('class:get-waiting-students', async (payload) => {
    try {
      const { roomId } = payload;
      console.log(`[ADMISSION] class:get-waiting-students received userId=${uid} role=${role} roomId=${roomId}`);
      const validation = await validateClassAccess(uid, role, roomId);
      
      if (!validation.valid || !validation.isTeacher) return;

      const waitingStudents = await getWaitingStudents(roomId);
      console.log(`[ADMISSION] waiting students fetched count=${waitingStudents.length} students=${waitingStudents.map(s => s.name).join(', ')}`);
      socket.emit('class:waiting-students-list', waitingStudents);
    } catch (err) {
      console.error('[Admission] get-waiting-students error:', err.message);
    }
  });

  // ── Faculty admits a student ───────────────────────────────────────────────
  socket.on('class:admit-student', async (payload) => {
    try {
      const { roomId, targetUserId } = payload;
      const targetStr = String(targetUserId);
      console.log(`[ADMISSION] class:admit-student received faculty=${uid} role=${role} targetUserId=${targetStr} roomId=${roomId}`);

      // Authorisation: use socket.userId (faculty), not payload.facultyId
      const validation = await validateClassAccess(uid, role, roomId);
      console.log(`[ADMISSION] admit validation:`, { valid: validation.valid, isTeacher: validation.isTeacher });
      
      if (!validation.valid || !validation.isTeacher) {
        console.warn(`[ADMISSION] admit-student BLOCKED - not authorized faculty=${uid} role=${role}`);
        return;
      }

      const waitingStudents = await getWaitingStudents(roomId);
      console.log(`[ADMISSION] waiting list:`, waitingStudents.map(s => ({ userId: s.userId, name: s.name })));

      // Normalize comparison: compare as strings
      const student = waitingStudents.find(s => String(s.userId) === targetStr);
      
      if (student) {
        await removeStudentFromWaitingRoom(roomId, targetStr);
        
        const { redisClient } = require('../config/redis');
        await redisClient.sAdd(`admitted:${roomId}`, targetStr);
        await redisClient.expire(`admitted:${roomId}`, 4 * 3600);

        io.to(student.socketId).emit('class:admitted');
        io.to(roomId).emit('class:student-left-waiting', { userId: targetStr });
        recordStudentAttendance(roomId, targetStr);

        console.log(`[ADMISSION] ✅ admitted user=${targetStr} name=${student.name} by faculty=${uid} room=${roomId}`);
      } else {
        console.warn(`[ADMISSION] ⚠️ student not found in waiting list targetUserId=${targetStr}`);
      }
    } catch (err) {
      console.error('[Admission] admit-student error:', err.message);
    }
  });

  // ── Faculty admits all waiting students ────────────────────────────────────
  const handleAdmitAll = async (payload) => {
    try {
      const roomId = payload?.roomId || socket.waitingRoomId || socket.classroomRoomId;
      if (!roomId) {
        console.warn(`[ADMISSION] admit-all received without roomId`);
        return;
      }
      console.log(`[ADMISSION] class:admit-all received faculty=${uid} role=${role} roomId=${roomId}`);

      const validation = await validateClassAccess(uid, role, roomId);
      if (!validation.valid || !validation.isTeacher) {
        console.warn(`[ADMISSION] admit-all BLOCKED - not authorized faculty=${uid} role=${role}`);
        return;
      }

      const waitingStudents = await getWaitingStudents(roomId);
      console.log(`[ADMISSION] admit-all count=${waitingStudents.length}`);
      if (!waitingStudents || waitingStudents.length === 0) return;

      const { redisClient } = require('../config/redis');

      for (const student of waitingStudents) {
        try {
          const targetStr = String(student.userId);
          await removeStudentFromWaitingRoom(roomId, targetStr);
          await redisClient.sAdd(`admitted:${roomId}`, targetStr);

          if (student.socketId) {
            io.to(student.socketId).emit('class:admitted');
          }
          io.to(targetStr).emit('class:admitted');
          io.to(roomId).emit('class:student-left-waiting', { userId: targetStr });
          recordStudentAttendance(roomId, targetStr);

          console.log(`[ADMISSION] ✅ admitted user=${targetStr} name=${student.name} via admit-all`);
        } catch (sErr) {
          console.error(`[ADMISSION] Error admitting student in admit-all:`, sErr);
        }
      }

      await redisClient.expire(`admitted:${roomId}`, 4 * 3600);
      io.to(`waiting:${roomId}`).emit('class:admitted');
      io.to(roomId).emit('class:waiting-students-list', []);
      console.log(`[ADMISSION] ✅ admit-all finished for room=${roomId}`);
    } catch (err) {
      console.error('[Admission] admit-all error:', err.message);
    }
  };

  socket.on('class:admit-all', handleAdmitAll);
  socket.on('admit-all', handleAdmitAll);

  // ── Faculty rejects a student ──────────────────────────────────────────────
  socket.on('class:reject-student', async (payload) => {
    try {
      const { roomId, targetUserId } = payload;
      const targetStr = String(targetUserId);
      console.log(`[ADMISSION] class:reject-student received faculty=${uid} role=${role} targetUserId=${targetStr} roomId=${roomId}`);

      const validation = await validateClassAccess(uid, role, roomId);
      if (!validation.valid || !validation.isTeacher) {
        console.warn(`[ADMISSION] reject-student BLOCKED - not authorized faculty=${uid} role=${role}`);
        return;
      }

      const waitingStudents = await getWaitingStudents(roomId);
      // Normalize comparison: compare as strings
      const student = waitingStudents.find(s => String(s.userId) === targetStr);
      
      if (student) {
        await removeStudentFromWaitingRoom(roomId, targetStr);
        io.to(student.socketId).emit('class:rejected', { message: 'Your request to join was not approved.' });
        io.to(roomId).emit('class:student-left-waiting', { userId: targetStr });
        console.log(`[ADMISSION] ✅ rejected user=${targetStr} name=${student.name} by faculty=${uid} room=${roomId}`);
      } else {
        console.warn(`[ADMISSION] ⚠️ student not found in waiting list targetUserId=${targetStr}`);
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
