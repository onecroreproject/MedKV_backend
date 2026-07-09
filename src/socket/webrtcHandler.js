const LiveClass = require('../models/LiveClass.model');
const Attendance = require('../models/Attendance.model');

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
      activeRooms[roomId] = { teacher: null, students: {}, waiting: {} };
    }

    if (userRole === 'Faculty' || userRole === 'teacher' || userRole === 'admin') {
      activeRooms[roomId].teacher = socket.id;
      console.log(`Teacher ${name} joined room ${roomId}`);
      // Notify everyone the teacher is here
      socket.to(roomId).emit('teacher-joined', { socketId: socket.id });
      
      // Update DB to Active
      await LiveClass.updateOne({ _id: roomId }, { roomStatus: 'active', startedAt: new Date() });
    } else {
      activeRooms[roomId].waiting[socket.id] = { userId, name };
      console.log(`Student ${name} joined waiting room ${roomId}`);
      // Notify student they are in waiting room
      socket.emit('joined-waiting-room');
      
      // Notify teacher that a student is waiting
      if (activeRooms[roomId].teacher) {
        io.to(activeRooms[roomId].teacher).emit('student-waiting', { socketId: socket.id, name, userId });
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
  socket.on('send-chat', async (payload) => {
    io.to(socket.roomId).emit('receive-chat', {
      senderId: socket.id,
      name: socket.userName,
      role: socket.userRole,
      message: payload.message,
      timestamp: new Date()
    });

    if (socket.userRole !== 'admin' && socket.userRole !== 'Faculty' && socket.userId) {
      await Attendance.updateOne(
        { liveClass: socket.roomId, student: socket.userId },
        { $inc: { chatMessages: 1 } }
      ).catch(err => console.error(err));
    }
  });

  // Admit Student from Waiting Room
  socket.on('admit-student', (payload) => {
    const { targetId } = payload;
    const room = activeRooms[socket.roomId];
    if (room && room.waiting && room.waiting[targetId]) {
      const studentData = room.waiting[targetId];
      // Move from waiting to students
      room.students[targetId] = studentData;
      delete room.waiting[targetId];

      // Notify the student they are admitted
      io.to(targetId).emit('admitted');
      
      // Notify the teacher to initiate WebRTC connection
      if (room.teacher) {
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
      ).exec().catch(err => console.error('Attendance track error:', err));
    }
  });

  // Admit All Students
  socket.on('admit-all', () => {
    const room = activeRooms[socket.roomId];
    if (room && room.waiting) {
      Object.keys(room.waiting).forEach(targetId => {
        const studentData = room.waiting[targetId];
        room.students[targetId] = studentData;
        
        io.to(targetId).emit('admitted');
        
        if (room.teacher) {
          io.to(room.teacher).emit('student-joined', { socketId: targetId, name: studentData.name, userId: studentData.userId });
        }

        Attendance.findOneAndUpdate(
          { liveClass: socket.roomId, student: studentData.userId },
          { $setOnInsert: { joinTime: new Date() }, $set: { status: 'Present' } },
          { upsert: true, new: true }
        ).exec().catch(err => console.error('Attendance track error:', err));
      });
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
        io.to(socket.roomId).emit('class-ended');
        room.teacher = null;
        room.students = {};
        await LiveClass.updateOne({ _id: socket.roomId }, { roomStatus: 'ended', status: 'Completed', endedAt: new Date(), liveParticipants: 0 });
        io.to('admin-room').emit('room-stats-update', { roomId: socket.roomId, participants: 0, status: 'ended' });
        delete activeRooms[socket.roomId];
      }
    }
  });

  // Host Controls: Kick Participant
  socket.on('kick-participant', async (payload) => {
    const { targetId } = payload;
    if (activeRooms[socket.roomId]) {
      io.to(targetId).emit('force-kick');
      const room = activeRooms[socket.roomId];
      if (room.students[targetId]) {
        const studentUserId = room.students[targetId].userId;
        await Attendance.updateOne(
          { liveClass: socket.roomId, student: studentUserId },
          { isKicked: true }
        ).catch(err => console.error(err));
      }
    }
  });

  // Host Controls: Force Mute Participant
  socket.on('force-mute', (payload) => {
    const { targetId } = payload;
    if (activeRooms[socket.roomId]) {
      io.to(targetId).emit('force-mute');
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
        socket.to(socket.roomId).emit('teacher-left');
        await LiveClass.updateOne({ _id: socket.roomId }, { roomStatus: 'ended', endedAt: new Date() });
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
