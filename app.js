const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes Entry Point
const authRoutes = require('./src/routes/auth.routes');
const studentRoutes = require('./src/routes/student.routes');
const facultyRoutes = require('./src/routes/faculty.routes');
const courseRoutes = require('./src/routes/course.routes');
const categoryRoutes = require('./src/routes/category.routes');
const enrollmentRoutes = require('./src/routes/enrollment.routes');
const liveClassRoutes = require('./src/routes/liveClass.routes');
const recordingRoutes = require('./src/routes/recording.routes');
const attendanceRoutes = require('./src/routes/attendance.routes');
const enquiryRoutes = require('./src/routes/enquiry.routes');
// ... other routes will be added here ...

// Mount Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/faculty', facultyRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/enroll', enrollmentRoutes);
app.use('/api/v1/live-classes', liveClassRoutes);
app.use('/api/v1/recordings', recordingRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/enquiries', enquiryRoutes);
app.use('/api/v1/settings', require('./src/routes/settings.routes'));
app.use('/api/v1/progress', require('./src/routes/progress.routes'));
app.use('/api/v1/notifications', require('./src/routes/notification.routes'));
app.use('/api/v1/search', require('./src/routes/search.routes'));
app.use('/api/v1/payment', require('./src/routes/payment.routes'));
app.use('/api/v1/tickets', require('./src/routes/ticket.routes'));
app.use('/api/v1/upload', require('./src/routes/upload.routes'));
app.use('/api/v1/dashboard', require('./src/routes/dashboard.routes'));

// Base route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to MedicalKV API' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

module.exports = app;
