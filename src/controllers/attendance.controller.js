const Attendance = require('../models/Attendance.model');

// @desc    Get attendance for a specific live class
// @route   GET /api/v1/attendance/:liveClassId
// @access  Private (Admin/Faculty)
exports.getAttendanceByClass = async (req, res) => {
  try {
    const attendance = await Attendance.find({ liveClass: req.params.liveClassId })
      .populate('student', 'name email');

    res.status(200).json({ success: true, count: attendance.length, data: attendance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Mark or Update attendance manually
// @route   POST /api/v1/attendance/:liveClassId
// @access  Private (Admin/Faculty)
exports.markAttendance = async (req, res) => {
  try {
    const { student, joinTime, leaveTime, duration, status } = req.body;
    
    // Upsert logic
    let attendance = await Attendance.findOne({ liveClass: req.params.liveClassId, student });

    if (attendance) {
      attendance.joinTime = joinTime || attendance.joinTime;
      attendance.leaveTime = leaveTime || attendance.leaveTime;
      attendance.duration = duration || attendance.duration;
      attendance.status = status || attendance.status;
      await attendance.save();
    } else {
      attendance = await Attendance.create({
        liveClass: req.params.liveClassId,
        student,
        joinTime,
        leaveTime,
        duration,
        status
      });
    }

    res.status(200).json({ success: true, data: attendance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
