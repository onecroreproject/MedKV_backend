const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const getRoomService = () => {
  const host = process.env.LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
};

const createLiveKitToken = async (req, res) => {
  try {
    const { roomId, participantName, role } = req.body;

    if (!roomId || !participantName) {
      return res.status(400).json({ message: 'Room ID and participant name are required' });
    }

    const isTeacher = role === 'teacher' || role === 'admin' || role === 'Faculty';

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: participantName,
        name: participantName,
      }
    );

    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      roomAdmin: isTeacher,
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

module.exports = {
  createLiveKitToken,
  forceMuteParticipant,
  kickParticipant
};
