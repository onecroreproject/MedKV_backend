const Recording = require('../models/Recording.model');
const Course = require('../models/Course.model');
const Lesson = require('../models/Lesson.model');
const CourseModule = require('../models/CourseModule.model');
const User = require('../models/User.model');
const { createAndSendNotification } = require('../utils/notification.util');
const fs = require('fs');
const path = require('path');
const { compressVideo } = require('../utils/videoCompressor');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc    Get all recordings
// @route   GET /api/v1/recordings
// @access  Public (or semi-public depending on auth)
exports.getRecordings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.liveClass) {
      filter.liveClass = req.query.liveClass;
    }

    let query = Recording.find(filter)
      .populate('course', 'title price')
      .populate('courseModule', 'title')
      .populate('lesson', 'title isFreePreview')
      .populate('faculty', 'name')
      .populate({
        path: 'liveClass',
        populate: [
          { path: 'course', select: 'title price' },
          { path: 'courseModule', select: 'title' },
          { path: 'lesson', select: 'title isFreePreview' }
        ]
      });
    
    // Sort by newest first
    query = query.sort({ createdAt: -1 });

    const recordings = await query;
    res.status(200).json({ success: true, count: recordings.length, data: recordings });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get single recording
// @route   GET /api/v1/recordings/:id
// @access  Public
exports.getRecording = async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id)
      .populate('course', 'title')
      .populate('courseModule', 'title')
      .populate('lesson', 'title')
      .populate('faculty', 'name')
      .populate({
        path: 'liveClass',
        populate: [
          { path: 'courseModule', select: 'title' },
          { path: 'lesson', select: 'title' }
        ]
      });
      
    if (!recording) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    res.status(200).json({ success: true, data: recording });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create new recording
// @route   POST /api/v1/recordings
// @access  Private (Admin/Faculty)
exports.createRecording = async (req, res) => {
  try {
    const recording = await Recording.create(req.body);
    
    // Sync with Lesson model
    let lessonTitle = 'New Video';
    if (recording.lesson && recording.videoUrl) {
      const lesson = await Lesson.findByIdAndUpdate(recording.lesson, { videoUrl: recording.videoUrl });
      if (lesson) lessonTitle = lesson.title;
    }
    
    // Notify users based on course/lesson access
    let userIds = [];
    let isFree = false;
    
    if (recording.course) {
      const courseObj = await Course.findById(recording.course);
      if (courseObj && courseObj.price === 0) isFree = true;
    }
    if (recording.lesson) {
      const lessonObj = await Lesson.findById(recording.lesson);
      if (lessonObj && lessonObj.isFreePreview) isFree = true;
    }

    if (isFree) {
      const allUsers = await User.find({ role: 'student' }).select('_id');
      userIds = allUsers.map(u => u._id);
    } else if (recording.course) {
      const enrolledUsers = await User.find({ 'enrolledCourses.course': recording.course }).select('_id');
      userIds = enrolledUsers.map(u => u._id);
    }

    if (userIds.length > 0) {
      createAndSendNotification(userIds, {
        title: 'New Video Uploaded!',
        message: `A new video "${recording.title || lessonTitle}" has been added${isFree ? ' as a free preview!' : ' to your course.'}`,
        type: 'recording',
        link: `/student/dashboard?tab=course-learning&courseId=${recording.course}`
      }, true);
    }

    res.status(201).json({ success: true, data: recording });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update recording
// @route   PUT /api/v1/recordings/:id
// @access  Private (Admin/Faculty)
exports.updateRecording = async (req, res) => {
  try {
    let recording = await Recording.findById(req.params.id);
    if (!recording) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    
    recording = await Recording.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    // Sync with Lesson model
    if (recording.lesson && req.body.videoUrl) {
      await Lesson.findByIdAndUpdate(recording.lesson, { videoUrl: req.body.videoUrl });
    }
    
    res.status(200).json({ success: true, data: recording });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete recording
// @route   DELETE /api/v1/recordings/:id
// @access  Private (Admin)
exports.deleteRecording = async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    
    await recording.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Upload new recording file
// @route   POST /api/v1/recordings/upload
// @access  Private (Admin/Faculty)
exports.uploadVideoRecording = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a video file' });
    }

    const { title, course, faculty, liveClass, duration, description } = req.body;
    let courseName = 'General';

    if (course) {
      const courseDoc = await Course.findById(course);
      if (courseDoc) {
        // Sanitize course name for folder
        courseName = courseDoc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      }
    }

    // Create course directory if it doesn't exist
    const baseUploadsDir = path.join(__dirname, '..', '..', 'uploads');
    const courseDir = path.join(baseUploadsDir, 'courses', courseName);
    if (!fs.existsSync(courseDir)) {
      fs.mkdirSync(courseDir, { recursive: true });
    }

    // Move file from temp to course folder
    const tempPath = req.file.path;
    const finalFilename = `${Date.now()}_${req.file.originalname}`;
    const finalPath = path.join(courseDir, finalFilename);

    try {
      fs.renameSync(tempPath, finalPath);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV' || renameErr.code === 'EBUSY') {
        fs.copyFileSync(tempPath, finalPath);
        try {
          fs.unlinkSync(tempPath);
        } catch (unlinkErr) {
          console.warn('Could not delete temp file after copy (locked by OS):', unlinkErr);
        }
      } else {
        throw renameErr;
      }
    }

    const videoUrl = `/uploads/courses/${courseName}/${finalFilename}`;

    // Create DB entry
    const recording = await Recording.create({
      title,
      description,
      course: course || undefined,
      faculty: faculty || undefined,
      liveClass: liveClass || undefined,
      duration: duration || undefined,
      videoUrl,
      compressionStatus: 'processing',
      isPublished: true
    });

    res.status(201).json({ success: true, data: recording, message: 'Upload complete. Compression started.' });

    // Start background compression
    compressVideo(finalPath, recording._id, finalFilename).catch(console.error);

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error during upload' });
  }
};

