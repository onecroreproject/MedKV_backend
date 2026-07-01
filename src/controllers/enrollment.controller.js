const User = require('../models/User.model');
const Course = require('../models/Course.model');

exports.enrollCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    let validUntil = null;
    if (course.duration && course.duration !== 'lifetime') {
      const days = parseInt(course.duration, 10);
      if (!isNaN(days)) {
        validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + days);
      }
    }

    // Atomically check and add to enrolledCourses to prevent race conditions
    const user = await User.findOneAndUpdate(
      { _id: userId, 'enrolledCourses.course': { $ne: courseId } },
      { 
        $push: { 
          enrolledCourses: { course: courseId, progress: 0, validUntil } 
        } 
      },
      { new: true }
    );

    if (!user) {
      // Either user doesn't exist or already enrolled
      const existingUser = await User.findById(userId);
      if (!existingUser) return res.status(404).json({ success: false, message: 'User not found' });
      return res.status(400).json({ success: false, message: 'Already enrolled in this course' });
    }

    res.status(200).json({
      success: true,
      data: user.enrolledCourses
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
