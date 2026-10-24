const os = require('os-utils');
const LiveClass = require('../models/LiveClass.model');

module.exports = (io, socket) => {
  socket.on('admin-join', async () => {
    socket.join('admin-room');
    console.log(`Admin joined live monitoring dashboard: ${socket.id}`);
    
    try {
      const activeClasses = await LiveClass.find({ status: 'Live Now' }).select('_id title liveParticipants roomStatus');
      const roomsStats = {};
      activeClasses.forEach(cls => {
        const roomClients = io.sockets.adapter.rooms.get(cls._id.toString());
        const count = roomClients ? roomClients.size : (cls.liveParticipants || 0);
        roomsStats[cls._id.toString()] = {
          title: cls.title,
          participants: count,
          status: cls.roomStatus || 'active'
        };
      });
      socket.emit('initial-rooms-stats', roomsStats);
    } catch (err) {
      console.error('[AdminHandler] Error fetching active rooms:', err.message);
    }
  });

  // Periodically emit server health to admins
  const healthInterval = setInterval(() => {
    if (io.sockets.adapter.rooms.get('admin-room')?.size > 0) {
      os.cpuUsage(async (cpuPercent) => {
        try {
          const liveClasses = await LiveClass.find({ status: 'Live Now' }).select('liveParticipants');
          const totalParticipants = liveClasses.reduce((acc, c) => acc + (c.liveParticipants || 0), 0);
          const stats = {
            cpu: (cpuPercent * 100).toFixed(2),
            freemem: os.freemem().toFixed(2),
            totalmem: os.totalmem().toFixed(2),
            memUsage: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2),
            sysUptime: os.sysUptime(),
            processUptime: os.processUptime(),
            totalActiveRooms: liveClasses.length,
            totalParticipants
          };
          io.to('admin-room').emit('server-health', stats);
        } catch (err) {
          console.warn('[AdminHandler] Error updating health stats:', err.message);
        }
      });
    }
  }, 5000); // every 5 seconds

  socket.on('disconnect', () => {
    clearInterval(healthInterval);
  });
};
