const User = require('../models/User.model');

// @desc    Get all faculty members
// @route   GET /api/v1/faculty
// @access  Private (Admin)
exports.getFaculty = async (req, res) => {
  try {
    const faculty = await User.find({ role: 'Faculty' }).select('-password').sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: faculty.length,
      data: faculty,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Server Error',
    });
  }
};
