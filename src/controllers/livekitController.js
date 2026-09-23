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

    if (!roomId || !participantName) {
      return res.status(400).json({ message: 'Room ID and participant name are required' });
    }

    // Authorization Check
    const liveClass = await LiveClass.findById(roomId);
    if (!liveClass) {
      return res.status(404).json({ message: 'Live class not found' });
    }

    let isAuthorized = false;
    let isTeacher = false;

    if (req.user.role.toLowerCase() === 'admin') {
      isAuthorized = true;
      isTeacher = true;
    } else if (req.user.role.toLowerCase() === 'faculty' || req.user.role.toLowerCase() === 'teacher') {
      if (liveClass.faculty.toString() === userId) {
        isAuthorized = true;
        isTeacher = true;
      } else {
        return res.status(403).json({ message: 'Not authorized to host this class' });
      }
    } else {
      // Student check
      if (liveClass.accessControl === 'all') {
        isAuthorized = true;
      } else if (liveClass.accessControl === 'selected') {
        if (liveClass.selectedStudents.includes(userId)) {
          isAuthorized = true;
        }
      } else if (liveClass.course) {
        const user = await User.findById(userId);
        if (user && user.enrolledCourses.some(ec => ec.course.toString() === liveClass.course.toString())) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized to join this class' });
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: userId.toString(),
        name: participantName,
        metadata: JSON.stringify({ isTeacher }),
        ttl: '4h', // Token valid for 4 hours — prevents re-auth latency mid-class
      }
    );

    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,           // Allow data channel messages (chat, signals)
      roomCreate: isTeacher,          // Teacher creates room instantly — no server wait
      roomAdmin: isTeacher,
      roomRecord: isTeacher,          // Allow teacher to trigger cloud recording
    });

    const token = await at.toJwt();
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    res.status(500).json({ message: 'Failed to generate token' });
  }
};


const forceMuteParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    // Fetch participant's tracks
    const participant = await svc.getParticipant(roomId, identity);
    
    // Mute all microphone tracks
    const audioTracks = participant.tracks.filter(t => t.type === 1); // 1 is Audio
    for (const track of audioTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, true);
    }
    
    res.status(200).json({ message: 'Participant muted' });
  } catch (error) {
    console.error('Error force muting:', error);
    res.status(500).json({ message: 'Failed to mute participant' });
  }
};

const kickParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    await svc.removeParticipant(roomId, identity);
    
    res.status(200).json({ message: 'Participant removed' });
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({ message: 'Failed to remove participant' });
  }
};

const forceCameraOffParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    const participant = await svc.getParticipant(roomId, identity);
    
    // Mute all camera tracks
    const videoTracks = participant.tracks.filter(t => t.type === 2); // 2 is Video
    for (const track of videoTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, true);
    }
    
    res.status(200).json({ message: 'Participant camera turned off' });
  } catch (error) {
    console.error('Error force camera off:', error);
    res.status(500).json({ message: 'Failed to turn off camera' });
  }
};

const forceUnmuteParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    const participant = await svc.getParticipant(roomId, identity);
    
    // Unmute all microphone tracks
    const audioTracks = participant.tracks.filter(t => t.type === 1); // 1 is Audio
    for (const track of audioTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, false);
    }
    
    res.status(200).json({ message: 'Participant unmuted' });
  } catch (error) {
    console.error('Error force unmuting:', error);
    res.status(500).json({ message: 'Failed to unmute participant' });
  }
};

const forceCameraOnParticipant = async (req, res) => {
  try {
    const { roomId, identity } = req.body;
    if (!roomId || !identity) return res.status(400).json({ message: 'Room ID and identity required' });

    const svc = getRoomService();
    const participant = await svc.getParticipant(roomId, identity);
    
    // Unmute all camera tracks
    const videoTracks = participant.tracks.filter(t => t.type === 2); // 2 is Video
    for (const track of videoTracks) {
      await svc.mutePublishedTrack(roomId, identity, track.sid, false);
    }
    
    res.status(200).json({ message: 'Participant camera turned on' });
  } catch (error) {
    console.error('Error force camera on:', error);
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
