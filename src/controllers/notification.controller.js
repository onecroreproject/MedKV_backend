const Notification = require('../models/Notification.model');
const { successResponse, errorResponse } = require('../utils/response.util');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit);

    return successResponse(res, notifications, 'Notifications retrieved successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Server Error', error.message);
  }
};

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return errorResponse(res, 404, 'Notification not found or unauthorized');
    }

    return successResponse(res, notification, 'Notification marked as read');
  } catch (error) {
    return errorResponse(res, 500, 'Server Error', error.message);
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { isRead: true }
    );

    return successResponse(res, {}, 'All notifications marked as read');
  } catch (error) {
    return errorResponse(res, 500, 'Server Error', error.message);
  }
};
