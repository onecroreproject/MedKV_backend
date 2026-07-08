const os = require('os-utils');
const { activeRooms } = require('./webrtcHandler');

module.exports = (io, socket) => {
  socket.on('admin-join', () => {
    socket.join('admin-room');
    console.log(`Admin joined live monitoring dashboard: ${socket.id}`);
    
    // Immediately send current active rooms state
    const roomsStats = {};
    Object.keys(activeRooms).forEach(roomId => {
      roomsStats[roomId] = {
        participants: Object.keys(activeRooms[roomId].students).length,
        status: activeRooms[roomId].teacher ? 'active' : 'waiting'
      };
    });
    socket.emit('initial-rooms-stats', roomsStats);
  });

  // Periodically emit server health to admins
  const healthInterval = setInterval(() => {
    if (io.sockets.adapter.rooms.get('admin-room')?.size > 0) {
      os.cpuUsage((cpuPercent) => {
        const stats = {
          cpu: (cpuPercent * 100).toFixed(2),
          freemem: os.freemem().toFixed(2),
          totalmem: os.totalmem().toFixed(2),
          memUsage: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2),
          sysUptime: os.sysUptime(),
          processUptime: os.processUptime(),
          totalActiveRooms: Object.keys(activeRooms).length,
          totalParticipants: Object.keys(activeRooms).reduce((acc, roomId) => acc + Object.keys(activeRooms[roomId].students).length, 0)
        };
        io.to('admin-room').emit('server-health', stats);
      });
    }
  }, 5000); // every 5 seconds

  socket.on('disconnect', () => {
    clearInterval(healthInterval);
  });
};
