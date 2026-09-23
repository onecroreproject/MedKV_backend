const mongoose = require('mongoose');

const recordingSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
  },
  roomId: {
    type: mongoose.Schema.ObjectId,
    ref: 'LiveClass',
    required: true,
  },
  teacherId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  courseId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Course',
  },
  expectedChunkIndex: {
    type: Number,
    default: 0,
  },
  receivedChunks: {
    type: Number,
    default: 0,
  },
  filepath: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['recording', 'finalized', 'failed'],
    default: 'recording',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('RecordingSession', recordingSessionSchema);
