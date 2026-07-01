const express = require('express');
const { enrollCourse } = require('../controllers/enrollment.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/:courseId', protect, enrollCourse);

module.exports = router;
