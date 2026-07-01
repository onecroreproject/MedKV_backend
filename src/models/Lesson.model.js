const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  module: {
    type: mongoose.Schema.ObjectId,
    ref: 'CourseModule',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Please add a lesson title'],
    trim: true,
  },
  description: {
    type: String,
  },
  videoUrl: {
    type: String,
    required: [true, 'Please add a video URL'],
  },
  duration: {
    type: String,
    default: '00:00',
  },
  order: {
    type: Number,
    default: 0,
  },
  isFreePreview: {
    type: Boolean,
    default: false,
  },
  resources: [{
    title: { type: String, required: true },
    fileUrl: { type: String, required: true },
    originalName: { type: String }
  }]
}, {
  timestamps: true,
});

module.exports = mongoose.model('Lesson', lessonSchema);
