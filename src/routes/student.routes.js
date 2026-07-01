const express = require('express');
const { getStudents, getStudentById, sendMessageToStudent } = require('../controllers/student.controller');
const router = express.Router();

// Will add auth middleware later: protect, authorize('admin')
router.route('/').get(getStudents);
router.route('/:id').get(getStudentById);
router.route('/:id/message').post(sendMessageToStudent);

module.exports = router;
