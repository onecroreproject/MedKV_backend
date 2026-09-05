const os = require('os');
const mongoose = require('mongoose');

const getServerDetails = async (req, res) => {
  try {
    const liveClassServer = {
      liveKitUrl: process.env.LIVEKIT_URL || 'Not Configured',
      apiKey: process.env.LIVEKIT_API_KEY ? process.env.LIVEKIT_API_KEY.substring(0, 4) + '...' + process.env.LIVEKIT_API_KEY.slice(-4) : 'Not Configured',
      status: process.env.LIVEKIT_URL ? 'Active' : 'Inactive',
      socketIoStatus: 'Active',
      corsOrigins: process.env.ALLOWED_ORIGINS || '*'
    };

    const backendServer = {
      nodeVersion: process.version,
      platform: os.platform(),
      architecture: os.arch(),
      uptime: Math.round(process.uptime() / 60) + ' minutes',
      totalMemory: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024) + ' MB',
      databaseStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      databaseHost: mongoose.connection.host || 'Unknown',
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5000
    };

    res.status(200).json({
      success: true,
      data: { liveClassServer, backendServer }
    });
  } catch (error) {
    console.error('Error fetching server details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getServerDetails };
