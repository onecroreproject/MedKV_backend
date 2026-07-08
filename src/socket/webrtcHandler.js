const LiveClass = require('../models/LiveClass.model');

// In-memory store for active rooms
// Structure: { roomId: { teacher: socketId, students: { studentSocketId: userObj } } }
const activeRooms = {};

module.exports = (io, socket) => {

  // Join a WebRTC Room
  socket.on('join-room', async (payload) => {
    const { roomId, userId, userRole, name } = payload;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.userRole = userRole;
    socket.userName = name;

    if (!activeRooms[roomId]) {
      activeRooms[roomId] = { teacher: null, students: {} };
    }

    if (userRole === 'Faculty' || userRole === 'teacher' || userRole === 'admin') {
      activeRooms[roomId].teacher = socket.id;
      console.log(`Teacher ${name} joined room ${roomId}`);
      // Notify everyone the teacher is here
      socket.to(roomId).emit('teacher-joined', { socketId: socket.id });
      
      // Update DB to Active
      await LiveClass.updateOne({ _id: roomId }, { roomStatus: 'active', startedAt: new Date() });
    } else {
      activeRooms[roomId].students[socket.id] = { userId, name };
      console.log(`Student ${name} joined room ${roomId}`);
      // Notify teacher that a student joined so teacher can initiate connection
      if (activeRooms[roomId].teacher) {
        io.to(activeRooms[roomId].teacher).emit('student-joined', { socketId: socket.id, name, userId });
      }
    }

    // Update active participants count in DB
    const participantCount = Object.keys(activeRooms[roomId].students).length;
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
  socket.on('send-chat', (payload) => {
    io.to(socket.roomId).emit('receive-chat', {
      senderId: socket.id,
      name: socket.userName,
      role: socket.userRole,
      message: payload.message,
      timestamp: new Date()
    });
  });

  // Raise Hand
  socket.on('raise-hand', () => {
    if (activeRooms[socket.roomId] && activeRooms[socket.roomId].teacher) {
      io.to(activeRooms[socket.roomId].teacher).emit('student-raised-hand', {
        socketId: socket.id,
        name: socket.userName
      });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    if (socket.roomId && activeRooms[socket.roomId]) {
      const room = activeRooms[socket.roomId];
      
      if (socket.userRole === 'Faculty' || socket.userRole === 'teacher') {
        room.teacher = null;
        socket.to(socket.roomId).emit('teacher-left');
        await LiveClass.updateOne({ _id: socket.roomId }, { roomStatus: 'ended', endedAt: new Date() });
      } else {
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
