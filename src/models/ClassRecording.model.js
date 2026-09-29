const mongoose = require('mongoose');

const classRecordingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a recording title'],
    trim: true,
  },
  course: {
    type: mongoose.Schema.ObjectId,
    ref: 'Course',
  },
  teacher: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  roomName: {
    type: String,
    required: true,
  },
  egressId: {
    type: String,
    required: true,
    unique: true,
  },
  fileName: {
    type: String,
  },
  filePath: {
    type: String,
  },
  duration: {
    type: Number, // in seconds or milliseconds
  },
  fileSize: {
    type: Number, // in bytes
  },
  status: {
    type: String,
    enum: ['EGRESS_STARTING', 'EGRESS_ACTIVE', 'EGRESS_COMPLETE', 'EGRESS_FAILED', 'EGRESS_ABORTED', 'EGRESS_LIMIT_REACHED'],
    default: 'EGRESS_STARTING',
  },
  startedAt: {
    type: Date,
  },
  endedAt: {
    type: Date,
  },
  description: {
    type: String,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('ClassRecording', classRecordingSchema);
