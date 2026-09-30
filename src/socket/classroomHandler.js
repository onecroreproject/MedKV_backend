const { 
  addRaisedHand, 
  removeRaisedHand, 
  getRaisedHands, 
  checkReactionRateLimit 
} = require('../services/classroom.service');
const { validateClassAccess } = require('../services/admission.service');
const { redisClient } = require('../config/redis');

const ALLOWED_REACTIONS = ['❤️', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'];

module.exports = (io, socket) => {
  // Common validation middleware for classroom events
  const validateAndExecute = async (roomId, userId, userRole, callback) => {
    try {
      const validation = await validateClassAccess(userId, userRole, roomId);
      
      if (!validation.valid) {
        return; // Invalid room or no access
      }
      
      // If student, check if admitted
      if (!validation.isTeacher) {
        const isAdmitted = await redisClient.sIsMember(`admitted:${roomId}`, userId.toString());
        if (!isAdmitted) return; // Not admitted
      }
      
      await callback(validation.isTeacher);
    } catch (err) {
      console.error('Classroom socket error:', err);
    }
  };

  socket.on('class:room-join', async (payload) => {
    const { roomId, userId, userRole } = payload;
    await validateAndExecute(roomId, userId, userRole, async () => {
      // Join the socket room for classroom events
      socket.join(roomId);
      
      // Track on socket for cleanup
      socket.classroomRoomId = roomId;
      socket.classroomUserId = userId;

      // Sync raised hands on join
      const hands = await getRaisedHands(roomId);
      socket.emit('class:raised-hands-list', hands);
    });
  });

  socket.on('class:raise-hand', async (payload) => {
    const { roomId, userId, userRole } = payload;
    await validateAndExecute(roomId, userId, userRole, async () => {
      await addRaisedHand(roomId, userId);
      // Track for disconnect cleanup
      socket.classroomRoomId = roomId;
      socket.classroomUserId = userId;
      
      io.to(roomId).emit('class:hand-updated', { userId, action: 'raised' });
    });
  });

  socket.on('class:lower-hand', async (payload) => {
    const { roomId, userId, userRole } = payload;
    await validateAndExecute(roomId, userId, userRole, async () => {
      await removeRaisedHand(roomId, userId);
      io.to(roomId).emit('class:hand-updated', { userId, action: 'lowered' });
    });
  });

  socket.on('class:clear-hand', async (payload) => {
    const { roomId, facultyId, userRole, targetUserId } = payload;
    await validateAndExecute(roomId, facultyId, userRole, async (isTeacher) => {
      if (!isTeacher) return; // Only faculty can clear hands
      await removeRaisedHand(roomId, targetUserId);
      io.to(roomId).emit('class:hand-updated', { userId: targetUserId, action: 'lowered' });
    });
  });

  socket.on('class:get-raised-hands', async (payload) => {
    const { roomId, userId, userRole } = payload;
    await validateAndExecute(roomId, userId, userRole, async () => {
      const hands = await getRaisedHands(roomId);
      socket.emit('class:raised-hands-list', hands);
    });
  });

  socket.on('class:reaction', async (payload) => {
    const { roomId, userId, userRole, name, reaction } = payload;
    
    if (!ALLOWED_REACTIONS.includes(reaction)) return;
    
    await validateAndExecute(roomId, userId, userRole, async () => {
      const allowed = await checkReactionRateLimit(roomId, userId);
      if (!allowed) return; // Rate limited

      // Broadcast reaction to the room
      io.to(roomId).emit('class:reaction', { userId, name, reaction, timestamp: Date.now() });
    });
  });

  socket.on('disconnect', async () => {
    if (socket.classroomRoomId && socket.classroomUserId) {
      try {
        await removeRaisedHand(socket.classroomRoomId, socket.classroomUserId);
        io.to(socket.classroomRoomId).emit('class:hand-updated', { userId: socket.classroomUserId, action: 'lowered' });
      } catch (err) {
        console.error('Error cleaning up raised hand on disconnect:', err);
      }
    }
  });
};
