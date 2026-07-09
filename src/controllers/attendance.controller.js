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

// @desc    Get attendance stats for a student
// @route   GET /api/v1/attendance/student/:studentId
// @access  Private
exports.getStudentAttendanceStats = async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const attendance = await Attendance.find({ student: studentId })
      .populate('liveClass', 'title date time duration meetingProvider status startedAt endedAt')
      .sort({ createdAt: -1 });
      
    // Calculate aggregate stats
    const totalClasses = attendance.length;
    const totalDuration = attendance.reduce((acc, curr) => acc + (curr.duration || 0), 0);
    const totalChats = attendance.reduce((acc, curr) => acc + (curr.chatMessages || 0), 0);
    const totalHandRaises = attendance.reduce((acc, curr) => acc + (curr.handRaises || 0), 0);
    
    res.status(200).json({
      success: true,
      stats: { totalClasses, totalDuration, totalChats, totalHandRaises },
      history: attendance
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
