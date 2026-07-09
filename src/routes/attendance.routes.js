const express = require('express');
const {
  getAttendanceByClass,
  markAttendance,
  getStudentAttendanceStats
} = require('../controllers/attendance.controller');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.route('/:liveClassId')
  .get(getAttendanceByClass)
  .post(protect, authorize('Admin', 'Faculty'), markAttendance);

router.route('/student/:studentId')
  .get(getStudentAttendanceStats);

module.exports = router;
