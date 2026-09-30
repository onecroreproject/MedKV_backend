const { 
  validateClassAccess, 
  addStudentToWaitingRoom, 
  removeStudentFromWaitingRoom, 
  getWaitingStudents 
} = require('../services/admission.service');

module.exports = (io, socket) => {
  // Student requests to join a class
  socket.on('class:join-request', async (payload) => {
    try {
      const { roomId, userId, userRole, name } = payload;
      
      const validation = await validateClassAccess(userId, userRole, roomId);
      
      if (!validation.valid) {
        return socket.emit('class:rejected', { message: validation.message });
      }

      // If faculty, admit them immediately
      if (validation.isTeacher) {
        socket.join(roomId);
        socket.emit('class:admitted');
        return;
      }

      // Check if already admitted
      const { redisClient } = require('../config/redis');
      const isAdmitted = await redisClient.sIsMember(`admitted:${roomId}`, userId.toString());
      if (isAdmitted) {
        socket.join(`waiting:${roomId}`); // In case they need to receive other events, though they'll move to classroom
        socket.emit('class:admitted');
        return;
      }

      // If student, add to waiting room
      const studentData = { userId, name, socketId: socket.id, role: userRole };
      await addStudentToWaitingRoom(roomId, studentData);

      // Track on socket for disconnect cleanup
      socket.waitingRoomId = roomId;
      socket.waitingUserId = userId;

      // Join a socket room specific to this class to receive waiting room events
      socket.join(`waiting:${roomId}`);

      socket.emit('class:waiting-room-joined');

      // Notify faculty in the main room
      io.to(roomId).emit('class:waiting-student', studentData);

    } catch (err) {
      console.error('Join request error:', err);
      socket.emit('class:rejected', { message: 'Server error during admission' });
    }
  });

  // Faculty requests waiting students (e.g. on reconnect)
  socket.on('class:get-waiting-students', async (payload) => {
    try {
      const { roomId, userId, userRole } = payload;
      const validation = await validateClassAccess(userId, userRole, roomId);
      
      if (!validation.valid || !validation.isTeacher) {
        return; // Unauthorized
      }

      const waitingStudents = await getWaitingStudents(roomId);
      socket.emit('class:waiting-students-list', waitingStudents);
    } catch (err) {
      console.error('Error fetching waiting students:', err);
    }
  });

  // Faculty admits a student
  socket.on('class:admit-student', async (payload) => {
    try {
      const { roomId, facultyId, userRole, targetUserId } = payload;
      const validation = await validateClassAccess(facultyId, userRole, roomId);
      
      if (!validation.valid || !validation.isTeacher) {
        return;
      }

      const waitingStudents = await getWaitingStudents(roomId);
      const student = waitingStudents.find(s => s.userId === targetUserId);
      
      if (student) {
        await removeStudentFromWaitingRoom(roomId, targetUserId);
        
        // Add to admitted list in Redis to allow token generation
        const { redisClient } = require('../config/redis');
        await redisClient.sAdd(`admitted:${roomId}`, targetUserId.toString());
        await redisClient.expire(`admitted:${roomId}`, 4 * 3600); // 4 hours

        // Notify the specific student via their socket ID
        io.to(student.socketId).emit('class:admitted');
        
        // Let faculty know they are admitted
        io.to(roomId).emit('class:student-left-waiting', { userId: targetUserId });
      }
    } catch (err) {
      console.error('Error admitting student:', err);
    }
  });

  // Faculty rejects a student
  socket.on('class:reject-student', async (payload) => {
    try {
      const { roomId, facultyId, userRole, targetUserId } = payload;
      const validation = await validateClassAccess(facultyId, userRole, roomId);
      
      if (!validation.valid || !validation.isTeacher) {
        return;
      }

      const waitingStudents = await getWaitingStudents(roomId);
      const student = waitingStudents.find(s => s.userId === targetUserId);
      
      if (student) {
        await removeStudentFromWaitingRoom(roomId, targetUserId);
        
        io.to(student.socketId).emit('class:rejected', { message: 'Your request to join was not approved.' });
        io.to(roomId).emit('class:student-left-waiting', { userId: targetUserId });
      }
    } catch (err) {
      console.error('Error rejecting student:', err);
    }
  });

  // Clean up if a student disconnects while waiting
  socket.on('disconnect', async () => {
    if (socket.waitingRoomId && socket.waitingUserId) {
      try {
        await removeStudentFromWaitingRoom(socket.waitingRoomId, socket.waitingUserId);
        io.to(socket.waitingRoomId).emit('class:student-left-waiting', { userId: socket.waitingUserId });
      } catch (err) {
        console.error('Error cleaning up waiting room on disconnect:', err);
      }
    }
  });
};
