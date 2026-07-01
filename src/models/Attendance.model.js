const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  liveClass: {
    type: mongoose.Schema.ObjectId,
    ref: 'LiveClass',
    required: [true, 'Attendance must belong to a Live Class']
  },
  student: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Attendance must belong to a Student']
  },
  joinTime: {
    type: Date,
  },
  leaveTime: {
    type: Date,
  },
  duration: {
    type: Number, // duration in minutes
    default: 0
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late Join'],
    default: 'Absent'
  }
}, {
  timestamps: true
});

// Prevent multiple attendance records for the same student in the same class
attendanceSchema.index({ liveClass: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
