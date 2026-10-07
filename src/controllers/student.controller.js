const User = require('../models/User.model');
const Payment = require('../models/Payment.model');
const { createAndSendNotification } = require('../utils/notification.util');

// @desc    Get all students
// @route   GET /api/v1/students
// @access  Private (Admin)
exports.getStudents = async (req, res) => {
  try {
    const { courseId } = req.query;
    let query = { role: 'Student' };
    
    if (courseId) {
      query['enrolledCourses.course'] = courseId;
    }

    const students = await User.find(query)
      .select('-password')
      .populate('enrolledCourses.course', 'title')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};

// @desc    Get single student by ID
// @route   GET /api/v1/students/:id
// @access  Private (Admin)
exports.getStudentById = async (req, res) => {
  try {
    const student = await User.findById(req.params.id)
      .select('-password')
      .populate('enrolledCourses.course');
      
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const payments = await Payment.find({ student: req.params.id })
      .populate('course', 'title')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: { ...student.toObject(), payments },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};

// @desc    Send message to student
// @route   POST /api/v1/students/:id/message
// @access  Private (Admin)
exports.sendMessageToStudent = async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
       return res.status(400).json({ success: false, message: 'Please provide title and message' });
    }
    const student = await User.findById(req.params.id);
    if (!student) {
       return res.status(404).json({ success: false, message: 'Student not found' });
    }

    await createAndSendNotification(
      [student._id], 
      { title, message, type: 'system' }, 
      true // Sends email as well
    );

    res.status(200).json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};

// @desc    Delete student
// @route   DELETE /api/v1/students/:id
// @access  Private (Admin)
exports.deleteStudent = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    if (student.role !== 'Student') {
      return res.status(400).json({ success: false, message: 'User is not a student' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};

// @desc    Manually enroll student in a course
// @route   POST /api/v1/students/:id/enroll
// @access  Private (Admin)
exports.enrollStudent = async (req, res) => {
  try {
    const { courseId } = req.body;
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Please provide courseId' });
    }
    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'Student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const Course = require('../models/Course.model');
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const isEnrolled = student.enrolledCourses.some(ec => ec.course.toString() === courseId);
    if (isEnrolled) {
      return res.status(400).json({ success: false, message: 'Student is already enrolled in this course' });
    }

    let validUntil = null;
    if (course.duration && course.duration !== 'lifetime') {
      const days = parseInt(course.duration, 10);
      if (!isNaN(days) && course.videoUploadedAt) {
        validUntil = new Date(course.videoUploadedAt);
        validUntil.setDate(validUntil.getDate() + days);
      }
    }

    await User.findByIdAndUpdate(student._id, {
      $push: { enrolledCourses: { course: course._id, progress: 0, validUntil } }
    });
    
    await Course.findByIdAndUpdate(course._id, { $inc: { registrationCount: 1 } });
    
    // Also create a manual Payment record to keep DB consistent
    const Payment = require('../models/Payment.model');
    await Payment.create({
      student: student._id,
      course: course._id,
      amount: 0, // Manual enrollment
      currency: 'INR',
      razorpayOrderId: 'MANUAL_ADMIN_ENROLL',
      razorpayPaymentId: 'pay_manual_' + Date.now(),
      type: 'Enrollment',
      status: 'Success'
    });

    res.status(200).json({ success: true, message: 'Student enrolled successfully' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};

// @desc    Manually unenroll student from a course
// @route   POST /api/v1/students/:id/unenroll
// @access  Private (Admin)
exports.unenrollStudent = async (req, res) => {
  try {
    const { courseId } = req.body;
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Please provide courseId' });
    }
    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'Student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const Course = require('../models/Course.model');
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const isEnrolled = student.enrolledCourses.some(ec => ec.course.toString() === courseId);
    if (!isEnrolled) {
      return res.status(400).json({ success: false, message: 'Student is not enrolled in this course' });
    }

    await User.findByIdAndUpdate(student._id, {
      $pull: { enrolledCourses: { course: course._id } }
    });
    
    await Course.findByIdAndUpdate(course._id, { $inc: { registrationCount: -1 } });

    res.status(200).json({ success: true, message: 'Student unenrolled successfully' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};

// @desc    Toggle student active status (Suspend/Activate)
// @route   PATCH /api/v1/students/:id/toggle-status
// @access  Private (Admin)
exports.toggleStudentStatus = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'Student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    // Toggle the status (default is true if not set)
    const currentStatus = student.isActive !== false;
    student.isActive = !currentStatus;
    await student.save();

    // Send email notification about account status change
    const title = student.isActive ? 'Account Activated' : 'Account Suspended';
    const message = student.isActive 
      ? 'Your account has been successfully activated. You can now access your courses and learning materials.'
      : 'Your account has been suspended by an administrator. Please contact support for more information.';
      
    await createAndSendNotification(
      [student._id],
      { title, message, type: 'system' },
      true // Sends email as well
    );

    res.status(200).json({ 
      success: true, 
      message: `Student account ${student.isActive ? 'activated' : 'suspended'} successfully`,
      isActive: student.isActive 
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};
