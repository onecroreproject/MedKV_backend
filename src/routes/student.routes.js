const express = require('express');
const { getStudents, getStudentById, sendMessageToStudent, deleteStudent, enrollStudent, unenrollStudent } = require('../controllers/student.controller');
const router = express.Router();

// Will add auth middleware later: protect, authorize('admin')
router.route('/').get(getStudents);
router.route('/:id').get(getStudentById).delete(deleteStudent);
router.route('/:id/message').post(sendMessageToStudent);
router.route('/:id/enroll').post(enrollStudent);
router.route('/:id/unenroll').post(unenrollStudent);

module.exports = router;
