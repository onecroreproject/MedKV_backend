const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Recording = require('../models/Recording.model');
const LiveClass = require('../models/LiveClass.model');

// Ensure upload dir exists
const uploadDir = path.join(__dirname, '../../uploads/recordings');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config for large webm files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `class-${req.body.roomId}-${Date.now()}.webm`);
  }
});
const upload = multer({ storage });

router.post('/upload-recording', upload.single('recording'), async (req, res) => {
  try {
    const { roomId, teacherId, courseId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No recording file provided' });
    }

    // Save metadata
    const recording = await Recording.create({
      title: `Live Class Recording - ${new Date().toLocaleDateString()}`,
      liveClass: roomId,
      faculty: teacherId,
      course: courseId,
      videoUrl: `/uploads/recordings/${file.filename}`,
      compressionStatus: 'none',
      isPublished: false // By default unpublished until reviewed
    });

    // Update LiveClass
    await LiveClass.updateOne({ _id: roomId }, { isRecording: false });

    res.status(200).json({ success: true, recording });
  } catch (error) {
    console.error('Error saving recording:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
