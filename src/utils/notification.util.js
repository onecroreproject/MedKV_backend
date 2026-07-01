const Notification = require('../models/Notification.model');
const sendEmail = require('./email.util');
const User = require('../models/User.model');

/**
 * Creates DB notifications and optionally sends emails.
 * 
 * @param {Array<string>} userIds - Array of User ObjectIds
 * @param {Object} notificationData - { title, message, type, link }
 * @param {Boolean} sendEmailFlag - Whether to also send an email
 */
const createAndSendNotification = async (userIds, notificationData, sendEmailFlag = true) => {
  try {
    if (!userIds || userIds.length === 0) return;

    // 1. Bulk create notifications
    const notificationsToInsert = userIds.map(userId => ({
      user: userId,
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type || 'system',
      link: notificationData.link || ''
    }));

    await Notification.insertMany(notificationsToInsert);

    // 2. Send emails
    if (sendEmailFlag) {
      // Find user emails
      const users = await User.find({ _id: { $in: userIds } }).select('email name');
      
      const emailPromises = users.map(user => {
        if (!user.email) return Promise.resolve();
        return sendEmail({
          email: user.email,
          subject: notificationData.title,
          message: `Hi ${user.name},\n\n${notificationData.message}\n\nView details here: ${notificationData.link || 'N/A'}\n\nBest,\nDr. Sam Reefath Radiology Academy`
        }).catch(err => {
          console.error(`Failed to send email to ${user.email}:`, err.message);
        });
      });

      // Execute in parallel without breaking the main thread
      await Promise.all(emailPromises);
    }
  } catch (error) {
    console.error('Error creating/sending notifications:', error);
  }
};

module.exports = {
  createAndSendNotification
};
