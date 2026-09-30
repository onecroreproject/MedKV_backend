const crypto = require('crypto');
const { 
  addRaisedHand, 
  removeRaisedHand, 
  getRaisedHands, 
  checkReactionRateLimit,
  checkChatRateLimit
} = require('../services/classroom.service');
const { validateClassAccess } = require('../services/admission.service');
const { redisClient } = require('../config/redis');

const ALLOWED_REACTIONS = ['❤️', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'];

module.exports = (io, socket) => {
  // Identity ALWAYS comes from the authenticated socket, never the payload
  const uid  = socket.userId;
  const role = socket.userRole;
  const name = socket.userName;

  // Common validation — roomId from payload; identity from socket
  const validateAndExecute = async (roomId, callback) => {
    try {
      const validation = await validateClassAccess(uid, role, roomId);
      if (!validation.valid) return;

      // Students must be admitted
      if (!validation.isTeacher) {
        const isAdmitted = await redisClient.sIsMember(`admitted:${roomId}`, uid);
        if (!isAdmitted) return;
      }

      await callback(validation.isTeacher);
    } catch (err) {
      console.error('[Classroom] socket error:', err.message);
    }
  };

  // ── Join classroom socket room ──────────────────────────────────────────────
  socket.on('class:room-join', async ({ roomId }) => {
    await validateAndExecute(roomId, async () => {
      socket.join(roomId);
      socket.classroomRoomId = roomId;
      socket.classroomUserId = uid;

      const hands = await getRaisedHands(roomId);
      socket.emit('class:raised-hands-list', hands);

      console.log(`[Classroom] user=${uid} role=${role} joined room=${roomId}`);
    });
  });

  // ── Raise hand ─────────────────────────────────────────────────────────────
  socket.on('class:raise-hand', async ({ roomId }) => {
    await validateAndExecute(roomId, async () => {
      await addRaisedHand(roomId, uid);
      socket.classroomRoomId = roomId;
      socket.classroomUserId = uid;
      io.to(roomId).emit('class:hand-updated', { userId: uid, action: 'raised' });
    });
  });

  // ── Lower hand ─────────────────────────────────────────────────────────────
  socket.on('class:lower-hand', async ({ roomId }) => {
    await validateAndExecute(roomId, async () => {
      await removeRaisedHand(roomId, uid);
      io.to(roomId).emit('class:hand-updated', { userId: uid, action: 'lowered' });
    });
  });

  // ── Faculty clears a student's hand ────────────────────────────────────────
  socket.on('class:clear-hand', async ({ roomId, targetUserId }) => {
    await validateAndExecute(roomId, async (isTeacher) => {
      if (!isTeacher) return; // server-side role check — payload role ignored
      await removeRaisedHand(roomId, targetUserId);
      io.to(roomId).emit('class:hand-updated', { userId: targetUserId, action: 'lowered' });
    });
  });

  // ── Get current raised-hands list ──────────────────────────────────────────
  socket.on('class:get-raised-hands', async ({ roomId }) => {
    await validateAndExecute(roomId, async () => {
      const hands = await getRaisedHands(roomId);
      socket.emit('class:raised-hands-list', hands);
    });
  });

  // ── Send reaction ──────────────────────────────────────────────────────────
  socket.on('class:reaction', async ({ roomId, reaction }) => {
    if (!ALLOWED_REACTIONS.includes(reaction)) return; // allowlist check
    await validateAndExecute(roomId, async () => {
      const allowed = await checkReactionRateLimit(roomId, uid);
      if (!allowed) return;
      io.to(roomId).emit('class:reaction', { userId: uid, name, reaction, timestamp: Date.now() });
    });
  });

  // ── Chat message ───────────────────────────────────────────────────────────
  const MAX_MSG_LENGTH = 1000;

  socket.on('class:chat-message', async ({ roomId, message }) => {
    // 1. Validate the socket is in this room (set on class:room-join)
    if (socket.classroomRoomId !== roomId) {
      return socket.emit('class:chat-error', { code: 'CHAT_NOT_IN_ROOM' });
    }

    // 2. Validate message content
    if (typeof message !== 'string' || !message.trim()) {
      return socket.emit('class:chat-error', { code: 'CHAT_MESSAGE_EMPTY' });
    }
    const trimmed = message.trim();
    if (trimmed.length > MAX_MSG_LENGTH) {
      return socket.emit('class:chat-error', { code: 'CHAT_MESSAGE_TOO_LONG' });
    }

    await validateAndExecute(roomId, async () => {
      // 3. Rate limit
      const allowed = await checkChatRateLimit(roomId, uid);
      if (!allowed) {
        return socket.emit('class:chat-error', { code: 'CHAT_RATE_LIMITED' });
      }

      // 4. Build server-generated message — frontend identity fields are IGNORED
      const chatMessage = {
        id:        crypto.randomUUID(),
        userId:    uid,
        name:      name,
        role:      role,
        message:   trimmed,
        timestamp: new Date().toISOString(),
        roomId:    roomId
      };

      io.to(roomId).emit('class:chat-message', chatMessage);
    });
  });

  // ── Cleanup on disconnect ──────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    if (socket.classroomRoomId && socket.classroomUserId) {
      try {
        await removeRaisedHand(socket.classroomRoomId, socket.classroomUserId);
        io.to(socket.classroomRoomId).emit('class:hand-updated', { 
          userId: socket.classroomUserId, action: 'lowered' 
        });
      } catch (err) {
        console.error('[Classroom] disconnect cleanup error:', err.message);
      }
    }
  });
};
