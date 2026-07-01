const express = require('express');
const { 
  logStudyTime, 
  markLessonComplete 
} = require('../controllers/progress.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect); // All progress routes require authentication

router.post('/time', logStudyTime);
router.post('/lesson/complete', markLessonComplete);

module.exports = router;
