const mongoose = require('mongoose');

const segmentSchema = new mongoose.Schema({
  egressId: { type: String, required: true },
  fileName: { type: String },
  filePath: { type: String },
  duration: { type: Number },
  fileSize: { type: Number },
  status: { type: String, default: 'EGRESS_STARTING' },
  startedAt: { type: Date },
  endedAt: { type: Date },
}, { _id: false });

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
  recordingProvider: {
    type: String,
    enum: ['webrtc', 'zoom'],
    default: 'webrtc'
  },
  zoomMeetingId: {
    type: String,
  },
  zoomRecordingId: {
    type: String,
  },
  playbackUrl: {
    type: String,
  },
  downloadUrl: {
    type: String,
  },
  egressId: {
    type: String,
    unique: true,
    sparse: true,
  },
  activeEgressId: {
    type: String,
  },
  segments: [segmentSchema],
  fileName: {
    type: String,
  },
  filePath: {
    type: String,
  },
  duration: {
    type: Number, // total duration of final merged file
    default: 0
  },
  fileSize: {
    type: Number, // total size of final merged file
    default: 0
  },
  status: {
    type: String, // EGRESS status fallback
    default: 'IDLE',
  },
  recordingState: {
    type: String,
    enum: ['idle', 'recording', 'paused', 'processing', 'completed', 'failed'],
    default: 'idle'
  },
  startedAt: {
    type: Date,
  },
  endedAt: {
    type: Date,
  },
  description: {
    type: String,
  },
  errorMessage: {
    type: String,
  }
}, {
  timestamps: true,
});

// Ensure we don't create duplicate recordings for the same Zoom Recording UUID
classRecordingSchema.index({ zoomRecordingId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ClassRecording', classRecordingSchema);
