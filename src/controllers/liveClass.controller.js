const LiveClass = require('../models/LiveClass.model');
const User = require('../models/User.model');
const { createAndSendNotification } = require('../utils/notification.util');

// @desc    Get all live classes
// @route   GET /api/v1/live-classes
// @access  Public (or semi-public depending on auth)
exports.getLiveClasses = async (req, res) => {
  try {
    let query = LiveClass.find()
      .populate('course', 'title price')
      .populate('courseModule', 'title')
      .populate('lesson', 'title isFreePreview')
      .populate('faculty', 'name');
    
    // Sort by date ascending (closest first)
    query = query.sort({ date: 1, time: 1 });

    const classes = await query;
    res.status(200).json({ success: true, count: classes.length, data: classes });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get single live class
// @route   GET /api/v1/live-classes/:id
// @access  Public
exports.getLiveClass = async (req, res) => {
  try {
    const liveClass = await LiveClass.findById(req.params.id)
      .populate('course', 'title')
      .populate('courseModule', 'title')
      .populate('lesson', 'title')
      .populate('faculty', 'name');
      
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    res.status(200).json({ success: true, data: liveClass });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create new live class
// @route   POST /api/v1/live-classes
// @access  Private (Admin/Faculty)
exports.createLiveClass = async (req, res) => {
  try {
    // If not admin, maybe force faculty to be req.user.id
    const liveClass = await LiveClass.create(req.body);

    // Notify users based on access control
    let userIds = [];
    if (liveClass.accessControl === 'all') {
      const allUsers = await User.find({ role: 'student' }).select('_id');
      userIds = allUsers.map(u => u._id);
    } else if (liveClass.accessControl === 'selected' && liveClass.selectedStudents && liveClass.selectedStudents.length > 0) {
      userIds = liveClass.selectedStudents;
    } else if (liveClass.course) {
      const enrolledUsers = await User.find({ 'enrolledCourses.course': liveClass.course }).select('_id');
      userIds = enrolledUsers.map(u => u._id);
    }

    if (userIds.length > 0) {
      createAndSendNotification(userIds, {
        title: 'New Live Session Scheduled!',
        message: `A new live session "${liveClass.title}" is scheduled for ${liveClass.date} at ${liveClass.time}.`,
        type: 'live_class',
        link: `/student/dashboard?tab=live`
      }, true);
    }

    res.status(201).json({ success: true, data: liveClass });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update live class
// @route   PUT /api/v1/live-classes/:id
// @access  Private (Admin/Faculty)
exports.updateLiveClass = async (req, res) => {
  try {
    let liveClass = await LiveClass.findById(req.params.id);
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    liveClass = await LiveClass.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({ success: true, data: liveClass });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete live class
// @route   DELETE /api/v1/live-classes/:id
// @access  Private (Admin)
exports.deleteLiveClass = async (req, res) => {
  try {
    const liveClass = await LiveClass.findById(req.params.id);
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    await liveClass.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
