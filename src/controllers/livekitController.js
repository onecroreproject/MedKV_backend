const { AccessToken } = require('livekit-server-sdk');

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

module.exports = {
  createLiveKitToken,
};
