const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const LiveClass = require('../models/LiveClass.model');
const User = require('../models/User.model');

const getRoomService = () => {
  const host = process.env.LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
};

const createLiveKitToken = async (req, res) => {
  try {
    const { roomId, participantName, role } = req.body;
    const userId = req.user._id || req.user.id;
    
    console.log(`[LIFECYCLE: LIVEKIT TOKEN] Request started for user: ${participantName} (${userId}) in room: ${roomId}`);

    if (!roomId || !participantName) {
      console.warn(`[LIFECYCLE: LIVEKIT TOKEN] Missing roomId or participantName`);
      return res.status(400).json({ message: 'Room ID and participant name are required' });
    }

    // Authorization Check
    const liveClass = await LiveClass.findById(roomId);
    if (!liveClass) {
      console.warn(`[LIFECYCLE: LIVEKIT TOKEN] Live class not found: ${roomId}`);
      return res.status(404).json({ message: 'Live class not found' });
    }

    let isAuthorized = false;
    let isTeacher = false;

    console.log(`[LIFECYCLE: LIVEKIT TOKEN] User role is: ${req.user.role}`);

    if (req.user.role.toLowerCase() === 'admin') {
      isAuthorized = true;
      isTeacher = true;
    } else if (req.user.role.toLowerCase() === 'faculty' || req.user.role.toLowerCase() === 'teacher') {
      if (liveClass.faculty && liveClass.faculty.toString() === userId.toString()) {
        isAuthorized = true;
        isTeacher = true;
        console.log(`[LIFECYCLE: LIVEKIT TOKEN] Assigned Faculty authorized as teacher`);
      } else {
        // Faculty who did not organize the class join as students
        isAuthorized = true;
        isTeacher = false;
        console.log(`[LIFECYCLE: LIVEKIT TOKEN] Unassigned faculty entering as student`);
      }
    } else {
      // Student check
      if (liveClass.accessControl === 'all') {
        isAuthorized = true;
        console.log(`[LIFECYCLE: LIVEKIT TOKEN] Student authorized via accessControl=all`);
      } else if (liveClass.accessControl === 'selected') {
        if (liveClass.selectedStudents.includes(userId)) {
          isAuthorized = true;
          console.log(`[LIFECYCLE: LIVEKIT TOKEN] Student authorized via selectedStudents`);
        }
      } else if (liveClass.course) {
        const user = await User.findById(userId);
        if (user && user.enrolledCourses.some(ec => ec.course.toString() === liveClass.course.toString())) {
          isAuthorized = true;
          console.log(`[LIFECYCLE: LIVEKIT TOKEN] Student authorized via course enrollment`);
        }
      }
    }

    if (!isAuthorized) {
      console.warn(`[LIFECYCLE: LIVEKIT TOKEN] Authorization failed for user ${userId}`);
      return res.status(403).json({ message: 'Not authorized to join this class' });
    }

    // Strict admission check for students
    if (!isTeacher) {
      const { redisClient } = require('../config/redis');
      const isAdmitted = await redisClient.sIsMember(`admitted:${roomId}`, userId.toString());
      if (!isAdmitted) {
        console.warn(`[LIFECYCLE: LIVEKIT TOKEN] Student ${userId} not admitted to room ${roomId}`);
        return res.status(403).json({ message: 'You have not been admitted by the host yet.' });
      }
      console.log(`[LIFECYCLE: LIVEKIT TOKEN] Student admission verified in Redis`);
    }

    console.log(`[LIFECYCLE: LIVEKIT TOKEN] Generating token for ${isTeacher ? 'Teacher' : 'Student'}...`);
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: userId.toString(),
        name: participantName,
        metadata: JSON.stringify({ isTeacher, role: isTeacher ? 'teacher' : 'student' }),
        ttl: '4h', // Token valid for 4 hours — prevents re-auth latency mid-class
      }
    );

    const grants = {
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,           // Allow data channel messages (chat, signals)
      roomCreate: isTeacher,          // Teacher creates room instantly — no server wait
      roomAdmin: isTeacher,
      roomRecord: isTeacher,          // Allow teacher to trigger cloud recording
    };
    
    console.log(`[LIFECYCLE: LIVEKIT TOKEN] Applied grants:`, grants);
    at.addGrant(grants);

    const token = await at.toJwt();
    console.log(`[LIFECYCLE: LIVEKIT TOKEN] Token successfully generated for ${participantName}`);
    res.status(200).json({ token });
  } catch (error) {
    console.error(`[LIFECYCLE: LIVEKIT TOKEN] Error generating LiveKit token:`, error);
    res.status(500).json({ message: 'Failed to generate token' });
  }
};


const forceMuteParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Action: forceMuteParticipant, Room: ${roomId}, Target Identity: ${identity}`);
    if (!roomId || !identity) {
      console.warn(`[LIFECYCLE: LIVEKIT ADMIN] Missing room or identity for force mute`);
      return res.status(400).json({ message: 'Room ID and identity required' });
    }

    const svc = getRoomService();
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Fetching tracks for identity: ${identity}`);
    const participant = await svc.getParticipant(roomId, identity);
    
    const audioTracks = participant.tracks.filter(t => t.type === 1);
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Found ${audioTracks.length} audio tracks to mute`);
    for (const track of audioTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, true);
      console.log(`[LIFECYCLE: LIVEKIT ADMIN] Muted track SID: ${track.sid}`);
    }
    
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] forceMuteParticipant completed successfully`);
    res.status(200).json({ message: 'Participant muted' });
  } catch (error) {
    console.error(`[LIFECYCLE: LIVEKIT ADMIN] Error force muting:`, error);
    res.status(500).json({ message: 'Failed to mute participant' });
  }
};

const kickParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Action: kickParticipant, Room: ${roomId}, Target Identity: ${identity}`);
    if (!roomId || !identity) {
      console.warn(`[LIFECYCLE: LIVEKIT ADMIN] Missing room or identity for kick`);
      return res.status(400).json({ message: 'Room ID and identity required' });
    }

    const svc = getRoomService();
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Calling removeParticipant on LiveKit server...`);
    await svc.removeParticipant(roomId, identity);
    
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Participant successfully removed from room`);
    res.status(200).json({ message: 'Participant removed' });
  } catch (error) {
    console.error(`[LIFECYCLE: LIVEKIT ADMIN] Error removing participant:`, error);
    res.status(500).json({ message: 'Failed to remove participant' });
  }
};

const forceCameraOffParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Action: forceCameraOffParticipant, Room: ${roomId}, Target Identity: ${identity}`);
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    const participant = await svc.getParticipant(roomId, identity);
    
    const videoTracks = participant.tracks.filter(t => t.type === 2);
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Found ${videoTracks.length} video tracks to disable`);
    for (const track of videoTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, true);
    }
    
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Participant camera turned off`);
    res.status(200).json({ message: 'Participant camera turned off' });
  } catch (error) {
    console.error(`[LIFECYCLE: LIVEKIT ADMIN] Error force camera off:`, error);
    res.status(500).json({ message: 'Failed to turn off camera' });
  }
};

const forceUnmuteParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Action: forceUnmuteParticipant, Room: ${roomId}, Target Identity: ${identity}`);
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    const participant = await svc.getParticipant(roomId, identity);
    
    const audioTracks = participant.tracks.filter(t => t.type === 1);
    for (const track of audioTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, false);
    }
    
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Participant unmuted`);
    res.status(200).json({ message: 'Participant unmuted' });
  } catch (error) {
    console.error(`[LIFECYCLE: LIVEKIT ADMIN] Error force unmuting:`, error);
    res.status(500).json({ message: 'Failed to unmute participant' });
  }
};

const forceCameraOnParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Action: forceCameraOnParticipant, Room: ${roomId}, Target Identity: ${identity}`);
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    const participant = await svc.getParticipant(roomId, identity);
    
    const videoTracks = participant.tracks.filter(t => t.type === 2);
    for (const track of videoTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, false);
    }
    
    console.log(`[LIFECYCLE: LIVEKIT ADMIN] Participant camera turned on`);
    res.status(200).json({ message: 'Participant camera turned on' });
  } catch (error) {
    console.error(`[LIFECYCLE: LIVEKIT ADMIN] Error force camera on:`, error);
    res.status(500).json({ message: 'Failed to turn on camera' });
  }
};

module.exports = {
  createLiveKitToken,
  forceMuteParticipant,
  kickParticipant,
  forceCameraOffParticipant,
  forceUnmuteParticipant,
  forceCameraOnParticipant
};
