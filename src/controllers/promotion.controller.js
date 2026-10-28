const { executePromotions } = require('../cron/promotions.cron');
const User = require('../models/User.model');
const Course = require('../models/Course.model');

// @desc    Get promotional campaign statistics
// @route   GET /api/v1/promotions/stats
// @access  Private (Admin)
exports.getPromotionStats = async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ role: 'Student', isActive: true });
    const publishedCourses = await Course.find({ status: 'Published' }).select('title price slug');
    
    // Students with at least 1 enrollment
    const activeStudents = await User.countDocuments({ 
      role: 'Student', 
      isActive: true, 
      'enrolledCourses.0': { $exists: true } 
    });
    const freshStudents = totalStudents - activeStudents;

    res.status(200).json({
      success: true,
      data: {
        totalActiveStudents: totalStudents,
        freshStudents,
        enrolledStudents: activeStudents,
        publishedCoursesCount: publishedCourses.length,
        courses: publishedCourses
      }
    });
  } catch (error) {
    console.error('Error fetching promotion stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send a test promotional email
// @route   POST /api/v1/promotions/send-test
// @access  Private (Admin)
exports.sendTestPromotion = async (req, res) => {
  try {
    const { email } = req.body;
    const targetEmail = email || req.user?.email || process.env.SMTP_EMAIL;

    if (!targetEmail) {
      return res.status(400).json({ success: false, message: 'Please provide a destination email' });
    }

    const result = await executePromotions({ isTest: true, testEmail: targetEmail });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error sending test promotion:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Trigger promotional email campaign manually
// @route   POST /api/v1/promotions/trigger
// @access  Private (Admin)
exports.triggerPromotions = async (req, res) => {
  try {
    const { limit } = req.body;
    const result = await executePromotions({ limit: limit ? parseInt(limit, 10) : null });
    res.status(200).json(result);
  } catch (error) {
    console.error('Error triggering promotions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
