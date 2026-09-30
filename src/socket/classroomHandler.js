const crypto = require('crypto');
const { RoomServiceClient } = require('livekit-server-sdk');
const { 
  addRaisedHand, 
  removeRaisedHand, 
  getRaisedHands, 
  checkReactionRateLimit,
  checkChatRateLimit,
  setModerationMute,
  clearModerationMute,
  isModerationMuted,
  setModerationCameraDisabled,
  clearModerationCameraDisabled,
  isModerationCameraDisabled,
  clearRoomModerationState,
} = require('../services/classroom.service');
const { validateClassAccess } = require('../services/admission.service');
const { redisClient } = require('../config/redis');

const ALLOWED_REACTIONS = ['❤️', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'];
const MAX_MSG_LENGTH = 1000;

// ─── LiveKit RoomServiceClient (reuses existing credentials) ─────────────────
const getLKService = () => {
  const host = process.env.LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
};

// ─── Mute all audio tracks via LiveKit server API ────────────────────────────
const lkMuteAudio = async (roomId, identity, muted) => {
  try {
    const svc = getLKService();
    const participant = await svc.getParticipant(roomId, identity);
    const audioTracks = participant.tracks.filter(t => t.type === 1);
    for (const track of audioTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, muted);
    }
  } catch (err) {
    // Participant may not have joined LiveKit yet — log and continue
    console.warn(`[Moderation] lkMuteAudio failed for ${identity}:`, err.message);
  }
};

// ─── Mute all video (camera) tracks via LiveKit server API ───────────────────
const lkMuteCamera = async (roomId, identity, muted) => {
  try {
    const svc = getLKService();
    const participant = await svc.getParticipant(roomId, identity);
    const videoTracks = participant.tracks.filter(t => t.type === 2);
    for (const track of videoTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, muted);
    }
  } catch (err) {
    console.warn(`[Moderation] lkMuteCamera failed for ${identity}:`, err.message);
  }
};

// ─── Remove participant from LiveKit room ────────────────────────────────────
const lkRemoveParticipant = async (roomId, identity) => {
  try {
    const svc = getLKService();
    await svc.removeParticipant(roomId, identity);
  } catch (err) {
    console.warn(`[Moderation] lkRemoveParticipant failed for ${identity}:`, err.message);
  }
};

module.exports = (io, socket) => {
  // Identity ALWAYS from authenticated socket (set by io.use() JWT middleware)
  const uid  = socket.userId;
  const role = socket.userRole;
  const name = socket.userName;

  // Common validation — roomId from payload; identity from socket
  const validateAndExecute = async (roomId, callback) => {
    try {
      const validation = await validateClassAccess(uid, role, roomId);
      if (!validation.valid) return;

      if (!validation.isTeacher) {
        const isAdmitted = await redisClient.sIsMember(`admitted:${roomId}`, uid);
        if (!isAdmitted) return;
      }
      await callback(validation.isTeacher);
    } catch (err) {
      console.error('[Classroom] socket error:', err.message);
    }
  };

  // Faculty-only gate
  const validateFaculty = async (roomId, callback) => {
    try {
      const validation = await validateClassAccess(uid, role, roomId);
      if (!validation.valid || !validation.isTeacher) {
        return socket.emit('class:moderation-error', { code: 'MODERATION_UNAUTHORIZED' });
      }
      // Socket must have joined this room
      if (socket.classroomRoomId !== roomId) {
        return socket.emit('class:moderation-error', { code: 'NOT_IN_ROOM' });
      }
      await callback();
    } catch (err) {
      console.error('[Moderation] faculty gate error:', err.message);
      socket.emit('class:moderation-error', { code: 'MODERATION_UNAUTHORIZED' });
    }
  };

  // Validate target student (must be admitted to this room, not a teacher)
  const validateTarget = async (roomId, targetUserId) => {
    const isAdmitted = await redisClient.sIsMember(`admitted:${roomId}`, targetUserId.toString());
    if (!isAdmitted) {
      socket.emit('class:moderation-error', { code: 'TARGET_NOT_FOUND' });
      return false;
    }
    return true;
  };

  // ── Join classroom socket room ──────────────────────────────────────────────
  socket.on('class:room-join', async ({ roomId }) => {
    await validateAndExecute(roomId, async () => {
      socket.join(roomId);
      socket.classroomRoomId = roomId;
      socket.classroomUserId = uid;

      const hands = await getRaisedHands(roomId);
      socket.emit('class:raised-hands-list', hands);

      // Restore moderation state for reconnecting user
      const [isMuted, isCamDisabled] = await Promise.all([
        isModerationMuted(roomId, uid),
        isModerationCameraDisabled(roomId, uid),
      ]);
      if (isMuted) {
        socket.emit('class:participant-muted', { roomId, targetUserId: uid, reconnect: true });
        // Re-apply LiveKit mute on reconnect
        await lkMuteAudio(roomId, uid, true);
      }
      if (isCamDisabled) {
        socket.emit('class:camera-disabled', { roomId, targetUserId: uid, reconnect: true });
        await lkMuteCamera(roomId, uid, true);
      }

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
      if (!isTeacher) return;
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
    if (!ALLOWED_REACTIONS.includes(reaction)) return;
    await validateAndExecute(roomId, async () => {
      const allowed = await checkReactionRateLimit(roomId, uid);
      if (!allowed) return;
      io.to(roomId).emit('class:reaction', { userId: uid, name, reaction, timestamp: Date.now() });
    });
  });

  // ── Chat message ───────────────────────────────────────────────────────────
  socket.on('class:chat-message', async ({ roomId, message }) => {
    if (socket.classroomRoomId !== roomId) {
      return socket.emit('class:chat-error', { code: 'CHAT_NOT_IN_ROOM' });
    }
    if (typeof message !== 'string' || !message.trim()) {
      return socket.emit('class:chat-error', { code: 'CHAT_MESSAGE_EMPTY' });
    }
    const trimmed = message.trim();
    if (trimmed.length > MAX_MSG_LENGTH) {
      return socket.emit('class:chat-error', { code: 'CHAT_MESSAGE_TOO_LONG' });
    }
    await validateAndExecute(roomId, async () => {
      const allowed = await checkChatRateLimit(roomId, uid);
      if (!allowed) return socket.emit('class:chat-error', { code: 'CHAT_RATE_LIMITED' });
      const chatMessage = {
        id: crypto.randomUUID(),
        userId: uid, name, role,
        message: trimmed,
        timestamp: new Date().toISOString(),
        roomId,
      };
      io.to(roomId).emit('class:chat-message', chatMessage);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MODERATION EVENTS
  // ════════════════════════════════════════════════════════════════════════════

  // ── Faculty: mute student ──────────────────────────────────────────────────
  socket.on('class:mute-participant', async ({ roomId, targetUserId }) => {
    await validateFaculty(roomId, async () => {
      if (!(await validateTarget(roomId, targetUserId))) return;
      await setModerationMute(roomId, targetUserId);
      await lkMuteAudio(roomId, targetUserId, true);
      const payload = {
        roomId, targetUserId,
        moderatedBy: uid,
        timestamp: new Date().toISOString(),
      };
      io.to(roomId).emit('class:participant-muted', payload);
      console.log(`[Moderation] muted user=${targetUserId} by faculty=${uid} room=${roomId}`);
    });
  });

  // ── Student: request to unmute ─────────────────────────────────────────────
  socket.on('class:request-unmute', async ({ roomId }) => {
    await validateAndExecute(roomId, async (isTeacher) => {
      if (isTeacher) return; // faculty can't request unmute
      const isMuted = await isModerationMuted(roomId, uid);
      if (!isMuted) return; // not moderation-muted
      io.to(roomId).emit('class:unmute-request', {
        roomId, userId: uid, name,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // ── Faculty: allow unmute ──────────────────────────────────────────────────
  socket.on('class:allow-unmute', async ({ roomId, targetUserId }) => {
    await validateFaculty(roomId, async () => {
      await clearModerationMute(roomId, targetUserId);
      // Unmute the LiveKit track
      await lkMuteAudio(roomId, targetUserId, false);
      const payload = { roomId, targetUserId, timestamp: new Date().toISOString() };
      io.to(roomId).emit('class:unmute-approved', payload);
      console.log(`[Moderation] unmute approved for user=${targetUserId} by faculty=${uid} room=${roomId}`);
    });
  });

  // ── Faculty: disable student camera ───────────────────────────────────────
  socket.on('class:disable-camera', async ({ roomId, targetUserId }) => {
    await validateFaculty(roomId, async () => {
      if (!(await validateTarget(roomId, targetUserId))) return;
      await setModerationCameraDisabled(roomId, targetUserId);
      await lkMuteCamera(roomId, targetUserId, true);
      const payload = {
        roomId, targetUserId,
        moderatedBy: uid,
        timestamp: new Date().toISOString(),
      };
      io.to(roomId).emit('class:camera-disabled', payload);
      console.log(`[Moderation] camera disabled user=${targetUserId} by faculty=${uid} room=${roomId}`);
    });
  });

  // ── Faculty: remove participant ────────────────────────────────────────────
  socket.on('class:remove-participant', async ({ roomId, targetUserId }) => {
    await validateFaculty(roomId, async () => {
      if (!(await validateTarget(roomId, targetUserId))) return;

      // 1. Revoke admission from Redis
      await redisClient.sRem(`admitted:${roomId}`, targetUserId.toString());
      // 2. Clean moderation state for this user
      await clearModerationMute(roomId, targetUserId);
      await clearModerationCameraDisabled(roomId, targetUserId);
      // 3. Remove from LiveKit room (authoritative media disconnect)
      await lkRemoveParticipant(roomId, targetUserId);

      const payload = {
        roomId, targetUserId,
        reason: 'Removed by faculty',
        timestamp: new Date().toISOString(),
      };
      // Notify the whole room so tiles update
      io.to(roomId).emit('class:participant-removed', { roomId, targetUserId });
      // Direct notification to the removed student — they may not be in the LK room yet but in the socket room
      io.to(roomId).emit('class:removed-from-class', payload); // student filters by targetUserId
      console.log(`[Moderation] removed user=${targetUserId} by faculty=${uid} room=${roomId}`);
    });
  });

  // ── Faculty: clear participant raised hand (reuses existing logic) ──────────
  socket.on('class:clear-participant-hand', async ({ roomId, targetUserId }) => {
    await validateFaculty(roomId, async () => {
      await removeRaisedHand(roomId, targetUserId);
      io.to(roomId).emit('class:hand-updated', { userId: targetUserId, action: 'lowered' });
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
