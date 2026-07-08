const http = require('http');
const app = require('./app');
const connectDB = require('./src/config/db.config');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

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

const webrtcHandler = require('./src/socket/webrtcHandler');
const adminHandler = require('./src/socket/adminHandler');

io.on('connection', (socket) => {
  // Pass socket instance to handlers
  webrtcHandler(io, socket);
  adminHandler(io, socket);
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
