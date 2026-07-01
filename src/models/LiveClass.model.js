const mongoose = require('mongoose');

const liveClassSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a session title'],
    trim: true,
  },
  course: {
    type: mongoose.Schema.ObjectId,
    ref: 'Course',
    required: false,
  },
  courseModule: {
    type: mongoose.Schema.ObjectId,
    ref: 'CourseModule',
    required: false,
  },
  lesson: {
    type: mongoose.Schema.ObjectId,
    ref: 'Lesson',
    required: false,
  },
  faculty: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Please assign a faculty to this class'],
  },
  notes: {
    type: String,
  },
  date: {
    type: Date,
    required: [true, 'Please add a session date'],
  },
  time: {
    type: String,
    required: [true, 'Please add a start time'],
  },
  duration: {
    type: Number,
    required: [true, 'Please specify the duration in minutes'],
    default: 60,
  },
  zoomLink: {
    type: String,
    required: [true, 'Please provide the meeting link'],
  },
  zoomId: {
    type: String,
  },
  zoomPasscode: {
    type: String,
  },
  status: {
    type: String,
    enum: ['Scheduled', 'Live Now', 'Completed', 'Cancelled'],
    default: 'Scheduled',
  },
  settings: {
    attendance: { type: Boolean, default: true },
    recording: { type: Boolean, default: true },
    reminder: { type: Boolean, default: true },
    push: { type: Boolean, default: false },
    questions: { type: Boolean, default: true },
  },
  accessControl: {
    type: String,
    enum: ['course', 'all', 'selected'],
    default: 'course'
  },
  selectedStudents: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
});

module.exports = mongoose.model('LiveClass', liveClassSchema);
