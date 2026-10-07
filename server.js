const http = require('http');
const app = require('./app');
const connectDB = require('./src/config/db.config');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

const { connectRedis } = require('./src/config/redis');

// Connect to MongoDB
connectDB();
connectRedis();

const server = http.createServer(app);

// Initialize Socket.io
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // Allow up to 100MB for media/chat
});

// Make io accessible in REST controllers
app.set('io', io);

const webrtcHandler = require('./src/socket/webrtcHandler');
const adminHandler = require('./src/socket/adminHandler');
const admissionHandler = require('./src/socket/admissionHandler');
const classroomHandler = require('./src/socket/classroomHandler');

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Authentication Middleware
// Uses the SAME JWT_SECRET and User model as auth.middleware.js (REST API).
// The client must pass the token in socket.handshake.auth.token (Bearer optional).
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const User = require('./src/models/User.model');

io.use(async (socket, next) => {
  try {
    const raw = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (!raw) {
      return next(new Error('AUTH_MISSING_TOKEN'));
    }

    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return next(new Error('AUTH_INVALID_TOKEN'));
    }

    const user = await User.findById(decoded.id).select('name role isActive activeToken');
    if (!user) {
      return next(new Error('AUTH_USER_NOT_FOUND'));
    }
    if (!user.isActive) {
      return next(new Error('AUTH_ACCOUNT_INACTIVE'));
    }
    // Session revocation — match the same check as auth.middleware.js
    if (user.activeToken && user.activeToken !== token) {
      return next(new Error('AUTH_SESSION_REVOKED'));
    }

    // Set verified identity on the socket — these are the ONLY trusted sources
    socket.userId   = user._id.toString();
    socket.userRole = user.role;      // 'Student' | 'Faculty' | 'Admin'
    socket.userName = user.name;

    // Safe log — no token, no secrets
    console.log(`[SocketAuth] authenticated user=${socket.userId} role=${socket.userRole}`);
    next();
  } catch (err) {
    console.error('[SocketAuth] middleware error:', err.message);
    next(new Error('AUTH_SERVER_ERROR'));
  }
});

// Expose globally for controllers/utils to emit events
global.io = io;

io.on('connection', (socket) => {
  // Join a personal room for user-specific notifications
  socket.on('setup', (userData) => {
    if (userData && userData._id) {
      socket.join(userData._id.toString());
      socket.emit('connected');
    }
  });

  // Pass socket instance to handlers
  webrtcHandler(io, socket);
  adminHandler(io, socket);
  admissionHandler(io, socket);
  classroomHandler(io, socket);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is in use, retrying in 1 second...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 1000);
  } else {
    console.error(e);
  }
});

server.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  
  // Start promotional emails cron job
  const { schedulePromotions } = require('./src/cron/promotions.cron');
  schedulePromotions();
  
  // Start periodic Zoom stale class reconciliation worker (runs every 15 minutes)
  const { reconcileStaleZoomClasses } = require('./src/services/zoom.service');
  setInterval(() => {
    reconcileStaleZoomClasses().catch(console.error);
  }, 15 * 60 * 1000); // 15 minutes
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Graceful shutdown for nodemon restarts and termination signals
const gracefulShutdown = () => {
  server.close(() => {
    console.log('HTTP server gracefully closed.');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown);
