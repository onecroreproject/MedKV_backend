const LiveClass = require('../models/LiveClass.model');
const Attendance = require('../models/Attendance.model');
const ClassRecording = require('../models/ClassRecording.model');
const { clearRoomModerationState } = require('../services/classroom.service');
const { EgressClient } = require('livekit-server-sdk');

const egressClient = new EgressClient(
  process.env.LIVEKIT_URL || 'https://livekit.drsamreefathradiologyacademy.com',
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

async function stopActiveRecording(roomId, io) {
  try {
    const recording = await ClassRecording.findOne({ roomName: roomId, recordingState: { $in: ['recording', 'paused'] } });
    if (recording) {
      if (recording.activeEgressId && recording.recordingState === 'recording') {
        await egressClient.stopEgress(recording.activeEgressId).catch(err => console.error('Egress stop error during class end', err));
        recording.activeEgressId = null;
      }
      recording.recordingState = 'processing';
      await recording.save();

      if (io) {
        io.to(roomId).emit('class:recording-stopping', {
          roomId: roomId,
          recordingId: recording._id,
          status: 'stopping'
        });
      }
    }
  } catch (err) {
    console.error('Error stopping recording on end class:', err);
  }
}

// In-memory store for active rooms
// Structure: { roomId: { teacher: socketId, students: { studentSocketId: userObj } } }
const activeRooms = {};

module.exports = (io, socket) => {

  // Join a WebRTC Room
  socket.on('join-room', async (payload) => {
    const { roomId } = payload;
    
    console.log(`[LIFECYCLE: SOCKET.IO] 'join-room' received for roomId: ${roomId}`);

    // Identity ALWAYS from socket (set by io.use() middleware — JWT-verified)
    const userId   = socket.userId;
    const userRole = socket.userRole;
    const name     = socket.userName;

    console.log(`[LIFECYCLE: SOCKET.IO] Authenticated User - ID: ${userId}, Name: ${name}, Role: ${userRole}`);

    socket.join(roomId);
    socket.roomId = roomId;

    if (!activeRooms[roomId]) {
      console.log(`[LIFECYCLE: SOCKET.IO] Initializing new activeRoom in memory for ${roomId}`);
      activeRooms[roomId] = { teacher: null, students: {}, waiting: {}, admittedUsers: new Set(), teacherTimeout: null };
    }

    const liveClass = await LiveClass.findById(roomId);
    
    let isTeacher = false;
    if (userRole?.toLowerCase() === 'admin') {
      isTeacher = true;
    } else if (userRole?.toLowerCase() === 'faculty' || userRole?.toLowerCase() === 'teacher') {
      if (liveClass && liveClass.faculty && liveClass.faculty.toString() === userId.toString()) {
        isTeacher = true;
      }
    }

    if (isTeacher) {
      console.log(`[LIFECYCLE: SOCKET.IO] Processing HOST join logic for ${name}`);
      const room = activeRooms[roomId];
      if (room.teacherTimeout) {
        clearTimeout(room.teacherTimeout);
        room.teacherTimeout = null;
        console.log(`[LIFECYCLE: SOCKET.IO] Teacher ${name} reconnected to room ${roomId}, disconnect timer cleared.`);
      }

      room.teacher = socket.id;
      console.log(`[LIFECYCLE: SOCKET.IO] Teacher ${name} joined room ${roomId} with socket ID: ${socket.id}`);
      
      // Notify everyone the teacher is here
      socket.to(roomId).emit('teacher-joined', { socketId: socket.id });
      
      // Notify teacher about already existing students (if reconnecting)
      Object.keys(room.students).forEach(studentSocketId => {
         const student = room.students[studentSocketId];
         socket.emit('student-joined', { socketId: studentSocketId, name: student.name, userId: student.userId });
      });
      
      // Notify teacher about students sitting in the waiting room (early arrivals)
      Object.keys(room.waiting).forEach(waitingSocketId => {
         const student = room.waiting[waitingSocketId];
         socket.emit('student-waiting', { socketId: waitingSocketId, name: student.name, userId: student.userId });
      });
      
      // Update DB to Active
      console.log(`[LIFECYCLE: SOCKET.IO] Updating LiveClass DB status to 'active' for room: ${roomId}`);
      await LiveClass.updateOne({ _id: roomId }, { roomStatus: 'active', startedAt: new Date() });
      io.emit('liveClassUpdate');
    } else {
      console.log(`[LIFECYCLE: SOCKET.IO] Processing STUDENT join logic for ${name}`);
      const room = activeRooms[roomId];
      if (room.admittedUsers.has(userId)) {
        // Auto-admit
        room.students[socket.id] = { userId, name };
        console.log(`[LIFECYCLE: SOCKET.IO] Student ${name} auto-admitted (previously approved) to room ${roomId}`);
        socket.emit('admitted');
        
        if (room.teacher) {
          io.to(room.teacher).emit('student-joined', { socketId: socket.id, name, userId });
        }
      } else {
        room.waiting[socket.id] = { userId, name };
        console.log(`[LIFECYCLE: SOCKET.IO] Student ${name} placed in waiting room for ${roomId}`);
        // Notify student they are in waiting room
        socket.emit('joined-waiting-room');
        
        // Notify teacher that a student is waiting
        if (room.teacher) {
          console.log(`[LIFECYCLE: SOCKET.IO] Notifying teacher that student ${name} is waiting.`);
          io.to(room.teacher).emit('student-waiting', { socketId: socket.id, name, userId });
        }
      }
    }

    // Update active participants count in DB
    const participantCount = Object.keys(activeRooms[roomId].students).length;
    console.log(`[LIFECYCLE: SOCKET.IO] Updating DB participant count to ${participantCount} for room ${roomId}`);
    await LiveClass.updateOne({ _id: roomId }, { liveParticipants: participantCount });
    
    // Broadcast to Admin
    io.to('admin-room').emit('room-stats-update', { roomId, participants: participantCount, status: activeRooms[roomId].teacher ? 'active' : 'waiting' });
  });

  // WebRTC Signaling: Offer
  socket.on('offer', (payload) => {
    // Send offer to a specific target
    io.to(payload.target).emit('offer', {
      caller: socket.id,
      sdp: payload.sdp,
      name: socket.userName
    });
  });

  // WebRTC Signaling: Answer
  socket.on('answer', (payload) => {
    io.to(payload.target).emit('answer', {
      caller: socket.id,
      sdp: payload.sdp
    });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', {
      caller: socket.id,
      candidate: payload.candidate
    });
  });

  // Classroom Features: Chat
  socket.on('send-chat', async (payload) => {
    io.to(socket.roomId).emit('receive-chat', {
      senderId: socket.id,
      name: socket.userName,
      role: socket.userRole,
      message: payload.message,
      timestamp: new Date()
    });

    if (socket.userRole !== 'admin' && socket.userRole !== 'Faculty' && socket.userId) {
      // Async database persistence without blocking chat delivery
      Attendance.updateOne(
        { liveClass: socket.roomId, student: socket.userId },
        { $inc: { chatMessages: 1 } }
      ).catch(err => console.error('Chat DB persistence error:', err));
    }
  });

  // Admit Student from Waiting Room
  socket.on('admit-student', async (payload) => {
    const { targetId } = payload;
    console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Action: admit-student, Room: ${socket.roomId}, Target Socket: ${targetId}`);
    const room = activeRooms[socket.roomId];
    if (room && room.waiting && room.waiting[targetId]) {
      const studentData = room.waiting[targetId];
      console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Found student in waiting room: ${studentData.name} (${studentData.userId})`);
      // Add to session memory
      room.admittedUsers.add(studentData.userId);
      
      // Also add to Redis for new livekitController check
      try {
        const { redisClient } = require('../config/redis');
        await redisClient.sAdd(`admitted:${socket.roomId}`, studentData.userId.toString());
        await redisClient.expire(`admitted:${socket.roomId}`, 4 * 3600);
        console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Persisted admission to Redis for ${studentData.userId}`);
      } catch (err) {
        console.error(`[LIFECYCLE: SOCKET.IO ADMIN] Redis admit error:`, err);
      }

      // Move from waiting to students
      room.students[targetId] = studentData;
      delete room.waiting[targetId];

      // Notify the student they are admitted
      console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Emitting 'admitted' to student ${targetId}`);
      io.to(targetId).emit('admitted');
      
      // Notify the teacher to initiate WebRTC connection
      if (room.teacher) {
        console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Notifying teacher that student ${targetId} joined`);
        io.to(room.teacher).emit('student-joined', { socketId: targetId, name: studentData.name, userId: studentData.userId });
      }
      
      // Update DB count & Attendance tracking
      const participantCount = Object.keys(room.students).length;
      LiveClass.updateOne({ _id: socket.roomId }, { liveParticipants: participantCount }).exec();
      io.to('admin-room').emit('room-stats-update', { roomId: socket.roomId, participants: participantCount, status: 'active' });

      Attendance.findOneAndUpdate(
        { liveClass: socket.roomId, student: studentData.userId },
        { $setOnInsert: { joinTime: new Date() }, $set: { status: 'Present' } },
        { upsert: true, new: true }
      ).exec().catch(err => console.error(`[LIFECYCLE: SOCKET.IO ADMIN] Attendance track error:`, err));
      
      console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Student admission complete`);
    } else {
      console.warn(`[LIFECYCLE: SOCKET.IO ADMIN] Target student ${targetId} not found in waiting room`);
    }
  });

  // Admit All Students
  socket.on('admit-all', async () => {
    console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Action: admit-all, Room: ${socket.roomId}`);
    const room = activeRooms[socket.roomId];
    if (room && room.waiting) {
      const waitingCount = Object.keys(room.waiting).length;
      console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Found ${waitingCount} students in waiting room`);
      const { redisClient } = require('../config/redis');
      
      for (const targetId of Object.keys(room.waiting)) {
        const studentData = room.waiting[targetId];
        room.admittedUsers.add(studentData.userId);
        room.students[targetId] = studentData;
        
        try {
          await redisClient.sAdd(`admitted:${socket.roomId}`, studentData.userId.toString());
        } catch (err) {
          console.error(`[LIFECYCLE: SOCKET.IO ADMIN] Redis admit error:`, err);
        }
        
        io.to(targetId).emit('admitted');
        
        if (room.teacher) {
          io.to(room.teacher).emit('student-joined', { socketId: targetId, name: studentData.name, userId: studentData.userId });
        }

        Attendance.findOneAndUpdate(
          { liveClass: socket.roomId, student: studentData.userId },
          { $setOnInsert: { joinTime: new Date() }, $set: { status: 'Present' } },
          { upsert: true, new: true }
        ).exec().catch(err => console.error(`[LIFECYCLE: SOCKET.IO ADMIN] Attendance track error:`, err));
      }
      try {
        await redisClient.expire(`admitted:${socket.roomId}`, 4 * 3600);
        console.log(`[LIFECYCLE: SOCKET.IO ADMIN] Admit all complete and persisted to Redis`);
      } catch (err) {}

      room.waiting = {};

      const participantCount = Object.keys(room.students).length;
      LiveClass.updateOne({ _id: socket.roomId }, { liveParticipants: participantCount }).exec();
      io.to('admin-room').emit('room-stats-update', { roomId: socket.roomId, participants: participantCount, status: 'active' });
    }
  });

  // Raise Hand
  socket.on('raise-hand', async (payload) => {
    if (activeRooms[socket.roomId] && activeRooms[socket.roomId].teacher) {
      io.to(activeRooms[socket.roomId].teacher).emit('student-raised-hand', {
        socketId: socket.id,
        name: payload?.name || socket.userName
      });
    }
    
    if (socket.userRole !== 'admin' && socket.userRole !== 'Faculty' && socket.userId) {
      await Attendance.updateOne(
        { liveClass: socket.roomId, student: socket.userId },
        { $inc: { handRaises: 1 } }
      ).catch(err => console.error(err));
    }
  });

  // End Class
  socket.on('end-class', async () => {
    if (socket.roomId && activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      if (socket.userRole === 'Faculty' || socket.userRole === 'teacher' || socket.userRole === 'admin') {
        if (room.teacherTimeout) clearTimeout(room.teacherTimeout);
        
        await stopActiveRecording(socket.roomId, io);

        io.to(socket.roomId).emit('class-ended');
        room.teacher = null;
        room.students = {};
        await LiveClass.updateOne({ _id: socket.roomId }, { roomStatus: 'ended', status: 'Completed', endedAt: new Date(), liveParticipants: 0 });
        io.to('admin-room').emit('room-stats-update', { roomId: socket.roomId, participants: 0, status: 'ended' });
        io.emit('liveClassUpdate');
        
        try {
          const { redisClient } = require('../config/redis');
          await redisClient.del(`admitted:${socket.roomId}`);
          const keys = await redisClient.keys(`waiting-room:${socket.roomId}:*`);
          if (keys && keys.length > 0) {
            await redisClient.del(keys);
          }
          await redisClient.del(`hands:${socket.roomId}`);
          await clearRoomModerationState(socket.roomId);
        } catch (err) {
          console.error('Redis cleanup error on end class:', err);
        }

        delete activeRooms[socket.roomId];
      }
    }
  });

  // Host Controls: Kick Participant
  socket.on('kick-participant', async (payload) => {
    const { targetId } = payload; // targetId is the userId (LiveKit identity)
    if (activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      // Find the socket ID of the student with this userId
      const studentSocketId = Object.keys(room.students).find(sid => room.students[sid].userId === targetId);
      
      if (studentSocketId) {
        io.to(studentSocketId).emit('force-kick');
        
        // Ensure they cannot bypass the waiting room if they try to rejoin
        room.admittedUsers.delete(targetId);
        
        const studentUserId = room.students[studentSocketId].userId;
        await Attendance.updateOne(
          { liveClass: socket.roomId, student: studentUserId },
          { isKicked: true }
        ).catch(err => console.error(err));
      }
    }
  });

  // Host Controls: Force Mute Participant
  socket.on('force-mute', (payload) => {
    const { targetId } = payload; // targetId is the userId
    if (activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      const studentSocketId = Object.keys(room.students).find(sid => room.students[sid].userId === targetId);
      if (studentSocketId) {
        io.to(studentSocketId).emit('force-mute');
      }
    }
  });

  // Host Controls: Force Camera Off Participant
  socket.on('force-camera-off', (payload) => {
    const { targetId } = payload; // targetId is the userId
    if (activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      const studentSocketId = Object.keys(room.students).find(sid => room.students[sid].userId === targetId);
      if (studentSocketId) {
        io.to(studentSocketId).emit('force-camera-off');
      }
    }
  });

  // Host Controls: Force Unmute Participant
  socket.on('force-unmute', (payload) => {
    const { targetId } = payload; // targetId is the userId
    if (activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      const studentSocketId = Object.keys(room.students).find(sid => room.students[sid].userId === targetId);
      if (studentSocketId) {
        io.to(studentSocketId).emit('force-unmute');
      }
    }
  });

  // Host Controls: Force Camera On Participant
  socket.on('force-camera-on', (payload) => {
    const { targetId } = payload; // targetId is the userId
    if (activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      const studentSocketId = Object.keys(room.students).find(sid => room.students[sid].userId === targetId);
      if (studentSocketId) {
        io.to(studentSocketId).emit('force-camera-on');
      }
    }
  });

  // Media State Changed
  socket.on('media-state-changed', (payload) => {
    if (activeRooms[socket.roomId] && activeRooms[socket.roomId].teacher) {
      io.to(activeRooms[socket.roomId].teacher).emit('participant-media-state', {
        socketId: socket.id,
        isMuted: payload.isMuted,
        isVideoOff: payload.isVideoOff
      });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    if (socket.roomId && activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      
      if (socket.userRole === 'Faculty' || socket.userRole === 'teacher' || socket.userRole === 'admin') {
        room.teacher = null;
        console.log(`Teacher disconnected from room ${socket.roomId}. Starting 2 minute grace period.`);
        
        socket.to(socket.roomId).emit('teacher-disconnected');
        
        room.teacherTimeout = setTimeout(async () => {
          console.log(`Grace period expired for room ${socket.roomId}. Ending class.`);
          
          await stopActiveRecording(socket.roomId, io);

          io.to(socket.roomId).emit('class-ended');
          io.to(socket.roomId).emit('teacher-left');
          await LiveClass.updateOne({ _id: socket.roomId }, { roomStatus: 'ended', endedAt: new Date(), liveParticipants: 0 });
          io.to('admin-room').emit('room-stats-update', { roomId: socket.roomId, participants: 0, status: 'ended' });
          io.emit('liveClassUpdate');
          
          try {
            const { redisClient } = require('../config/redis');
            await redisClient.del(`admitted:${socket.roomId}`);
            const keys = await redisClient.keys(`waiting-room:${socket.roomId}:*`);
            if (keys && keys.length > 0) {
              await redisClient.del(keys);
            }
            await redisClient.del(`hands:${socket.roomId}`);
            await clearRoomModerationState(socket.roomId);
          } catch (err) {
            console.error('Redis cleanup error on teacher timeout:', err);
          }

          delete activeRooms[socket.roomId];
        }, 120000); // 2 minutes
      } else {
        const studentObj = room.students[socket.id];
        if (studentObj) {
           // Calculate duration up to this disconnect
           try {
             const attendance = await Attendance.findOne({ liveClass: socket.roomId, student: studentObj.userId });
             if (attendance && attendance.joinTime) {
                const now = new Date();
                const sessionDurationMinutes = Math.max(0, Math.round((now - attendance.joinTime) / 60000));
                await Attendance.updateOne(
                  { _id: attendance._id },
                  { $inc: { duration: sessionDurationMinutes }, leaveTime: now }
                );
             }
           } catch (err) {
             console.error('Error updating disconnect duration', err);
           }
        }
        delete room.students[socket.id];
        if (room.teacher) {
          io.to(room.teacher).emit('student-left', { socketId: socket.id });
        }
      }

      const participantCount = Object.keys(room.students).length;
      await LiveClass.updateOne({ _id: socket.roomId }, { liveParticipants: participantCount });
      io.to('admin-room').emit('room-stats-update', { roomId: socket.roomId, participants: participantCount, status: room.teacher ? 'active' : 'ended' });

      // Clean up empty room
      if (!room.teacher && participantCount === 0) {
        delete activeRooms[socket.roomId];
      }
    }
  });
};

module.exports.activeRooms = activeRooms;
module.exports.stopActiveRecording = stopActiveRecording;
