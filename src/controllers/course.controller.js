const Course = require('../models/Course.model');
const CourseModule = require('../models/CourseModule.model');
const Lesson = require('../models/Lesson.model');
const User = require('../models/User.model');
const mongoose = require('mongoose');
const { createAndSendNotification } = require('../utils/notification.util');
const Recording = require('../models/Recording.model');
const path = require('path');
const { compressVideo } = require('../utils/videoCompressor');

// Helper: find course by MongoDB _id OR by slug string
const findCourseByIdOrSlug = (id) => {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return Course.findById(id);
  }
  return Course.findOne({ slug: id });
};

// @desc    Get all courses
// @route   GET /api/v1/courses
// @access  Public/Private
exports.getCourses = async (req, res) => {
  try {
    // Basic filtering based on query params (e.g. ?status=Published)
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.category) query.category = req.query.category;

    const courses = await Course.find(query).populate({
      path: 'instructor',
      select: 'name email profileImage'
    }).populate('category').sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: courses.length, data: courses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get single course with modules and lessons
// @route   GET /api/v1/courses/:id
// @access  Public/Private
exports.getCourse = async (req, res) => {
  try {
    const course = await findCourseByIdOrSlug(req.params.id)
      .populate({
        path: 'instructor',
        select: 'name email profileImage'
      })
      .populate('category')
      .populate({
        path: 'modules',
        populate: {
          path: 'lessons',
          options: { sort: { order: 1 } }
        },
        options: { sort: { order: 1 } }
      });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    res.status(200).json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Create new course
// @route   POST /api/v1/courses
// @access  Private (Admin/Faculty)
exports.createCourse = async (req, res) => {
  try {
    // In a real app, req.user.id would be attached by auth middleware
    // For now, we expect instructor ID in the body
    const course = await Course.create(req.body);

    // Notify all users about the new course
    const allUsers = await User.find({ role: 'student' }).select('_id');
    const userIds = allUsers.map(u => u._id);
    
    createAndSendNotification(userIds, {
      title: 'New Course Available!',
      message: `We have just published a new course: ${course.title}. Check it out now!`,
      type: 'course',
      link: `/student/dashboard?tab=courses`
    }, true);

    res.status(201).json({ success: true, data: course });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update course
// @route   PUT /api/v1/courses/:id
// @access  Private
exports.updateCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.status(200).json({ success: true, data: course });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete course
// @route   DELETE /api/v1/courses/:id
// @access  Private
exports.deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    // Trigger pre-remove hooks if we add them later, or manually delete children
    await CourseModule.deleteMany({ course: req.params.id });
    await course.deleteOne();
    
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// --- MODULES & LESSONS ---

// @desc    Add module to course
// @route   POST /api/v1/courses/:courseId/modules
// @access  Private
exports.addModule = async (req, res) => {
  try {
    req.body.course = req.params.courseId;
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const module = await CourseModule.create(req.body);
    res.status(201).json({ success: true, data: module });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update module
// @route   PUT /api/v1/courses/modules/:moduleId
// @access  Private
exports.updateModule = async (req, res) => {
  try {
    const module = await CourseModule.findByIdAndUpdate(req.params.moduleId, req.body, {
      new: true, runValidators: true
    });
    if (!module) return res.status(404).json({ success: false, message: 'Module not found' });
    res.status(200).json({ success: true, data: module });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete module
// @route   DELETE /api/v1/courses/modules/:moduleId
// @access  Private
exports.deleteModule = async (req, res) => {
  try {
    const module = await CourseModule.findById(req.params.moduleId);
    if (!module) return res.status(404).json({ success: false, message: 'Module not found' });
    
    await Lesson.deleteMany({ module: req.params.moduleId });
    await module.deleteOne();
    
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Reorder modules
// @route   PUT /api/v1/courses/:courseId/modules/reorder
// @access  Private
exports.reorderModules = async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, order }
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    const updates = items.map((item) => 
      CourseModule.findByIdAndUpdate(item.id, { order: item.order })
    );
    await Promise.all(updates);

    res.status(200).json({ success: true, message: 'Modules reordered successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Add lesson to module
// @route   POST /api/v1/courses/modules/:moduleId/lessons
// @access  Private
exports.addLesson = async (req, res) => {
  try {
    req.body.module = req.params.moduleId;
    const module = await CourseModule.findById(req.params.moduleId);
    if (!module) return res.status(404).json({ success: false, message: 'Module not found' });

    // Handle file upload
    if (req.file) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const relativePath = path.relative(uploadsDir, req.file.path).replace(/\\/g, '/');
      req.body.videoUrl = `/uploads/${relativePath}`;
    } else if (!req.body.videoUrl) {
      return res.status(400).json({ success: false, message: 'Please provide a video URL or upload a video file' });
    }

    const lesson = await Lesson.create(req.body);

    // Sync with Recording model
    let newRecording = null;
    if (lesson.videoUrl) {
      newRecording = await Recording.create({
        title: lesson.title,
        lesson: lesson._id,
        courseModule: module._id,
        course: module.course,
        videoUrl: lesson.videoUrl,
        duration: lesson.duration || '00:00'
      });
    }

    if (req.file && req.file.mimetype.startsWith('video/')) {
      compressVideo(req.file.path, newRecording ? newRecording._id : null, req.file.filename);
    }

    res.status(201).json({ success: true, data: lesson });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update lesson
// @route   PUT /api/v1/courses/lessons/:lessonId
// @access  Private
exports.updateLesson = async (req, res) => {
  try {
    if (req.file) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const relativePath = path.relative(uploadsDir, req.file.path).replace(/\\/g, '/');
      req.body.videoUrl = `/uploads/${relativePath}`;
    }
    const lesson = await Lesson.findByIdAndUpdate(req.params.lessonId, req.body, {
      new: true, runValidators: true
    }).populate('module');
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    // Sync with Recording model
    let recordingIdToCompress = null;
    if (req.body.videoUrl || req.body.title || req.body.duration) {
      const existingRecording = await Recording.findOne({ lesson: lesson._id });
      if (existingRecording) {
        if (req.body.videoUrl) existingRecording.videoUrl = req.body.videoUrl;
        if (req.body.title) existingRecording.title = req.body.title;
        if (req.body.duration) existingRecording.duration = req.body.duration;
        await existingRecording.save();
        recordingIdToCompress = existingRecording._id;
      } else if (lesson.videoUrl) {
        const newRecording = await Recording.create({
          title: lesson.title,
          lesson: lesson._id,
          courseModule: lesson.module._id,
          course: lesson.module.course,
          videoUrl: lesson.videoUrl,
          duration: lesson.duration || '00:00'
        });
        recordingIdToCompress = newRecording._id;
      }
    }

    if (req.file && req.file.mimetype.startsWith('video/')) {
      compressVideo(req.file.path, recordingIdToCompress, req.file.filename);
    }

    res.status(200).json({ success: true, data: lesson });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete lesson
// @route   DELETE /api/v1/courses/lessons/:lessonId
// @access  Private
exports.deleteLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    
    await lesson.deleteOne();
    
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Reorder lessons
// @route   PUT /api/v1/courses/modules/:moduleId/lessons/reorder
// @access  Private
exports.reorderLessons = async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, order }
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    const updates = items.map((item) => 
      Lesson.findByIdAndUpdate(item.id, { order: item.order })
    );
    await Promise.all(updates);

    res.status(200).json({ success: true, message: 'Lessons reordered successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Add resource to lesson
// @route   POST /api/v1/courses/lessons/:lessonId/resources
// @access  Private
exports.addResource = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a file' });
    }
    
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }

    const newResource = {
      title: req.body.title || req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
      originalName: req.file.originalname
    };

    lesson.resources.push(newResource);
    await lesson.save();

    res.status(201).json({ success: true, data: lesson });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete resource from lesson
// @route   DELETE /api/v1/courses/lessons/:lessonId/resources/:resourceId
// @access  Private
exports.deleteResource = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }

    lesson.resources = lesson.resources.filter(
      (r) => r._id.toString() !== req.params.resourceId
    );
    await lesson.save();

    res.status(200).json({ success: true, data: lesson });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
