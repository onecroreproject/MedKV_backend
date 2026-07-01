const User = require('../models/User.model');

// @desc    Log study time
// @route   POST /api/v1/progress/time
// @access  Private (Student)
exports.logStudyTime = async (req, res) => {
  try {
    const { minutes } = req.body;
    if (!minutes || typeof minutes !== 'number') {
      return res.status(400).json({ success: false, message: 'Please provide valid minutes' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.learningMinutes += minutes;

    // Streak calculation
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let lastActiveDay = null;
    if (user.lastActiveDate) {
      lastActiveDay = new Date(user.lastActiveDate.getFullYear(), user.lastActiveDate.getMonth(), user.lastActiveDate.getDate());
    }

    if (!lastActiveDay) {
      // First time tracking
      user.streakDays = 1;
    } else {
      const diffTime = today - lastActiveDay;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day
        user.streakDays += 1;
      } else if (diffDays > 1) {
        // Streak broken
        user.streakDays = 1;
      }
      // If diffDays === 0, same day, streak remains the same
    }

    user.lastActiveDate = now;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ 
      success: true, 
      data: {
        learningMinutes: user.learningMinutes,
        streakDays: user.streakDays,
        lastActiveDate: user.lastActiveDate
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Mark lesson complete
// @route   POST /api/v1/progress/lesson/complete
// @access  Private (Student)
exports.markLessonComplete = async (req, res) => {
  try {
    const { lessonId } = req.body;
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'Please provide a lessonId' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.completedLessons.includes(lessonId)) {
      user.completedLessons.push(lessonId);
      await user.save({ validateBeforeSave: false });
    }

    res.status(200).json({ 
      success: true, 
      data: {
        completedLessons: user.completedLessons
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
