const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a recording title'],
    trim: true,
  },
  description: {
    type: String,
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
    required: false,
  },
  videoUrl: {
    type: String,
    required: [true, 'Please provide the video URL'],
  },
  duration: {
    type: String, // e.g. "1h 30m" or just a number of minutes
  },
  liveClass: {
    type: mongoose.Schema.ObjectId,
    ref: 'LiveClass',
    required: false, // Optional, can be a standalone recording
  },
  thumbnail: {
    type: String,
    default: 'default_thumbnail.jpg'
  },
  isPublished: {
    type: Boolean,
    default: true,
  },
  compressionStatus: {
    type: String,
    enum: ['none', 'processing', 'completed', 'failed'],
    default: 'none',
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Recording', recordingSchema);
