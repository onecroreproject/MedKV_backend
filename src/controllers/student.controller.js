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

    const students = await User.find(query).select('-password').sort({ createdAt: -1 });
    
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

    const payments = await Payment.find({ student: req.params.id }).populate('course', 'title');

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
