const Notification = require('../models/Notification.model');
const { sendEmail, generateHTMLTemplate } = require('./email.util');
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

    const insertedDocs = await Notification.insertMany(notificationsToInsert);

    // Emit real-time notification to connected users
    if (global.io) {
      insertedDocs.forEach(notif => {
        global.io.to(notif.user.toString()).emit('newNotification', notif);
      });
    }

    // 2. Send emails
    if (sendEmailFlag) {
      // Find user emails
      const users = await User.find({ _id: { $in: userIds } }).select('email name');
      
      const emailPromises = users.map(user => {
        if (!user.email) return Promise.resolve();
          const message = `Hi ${user.name},\n\n${notificationData.message}\n\nView details here: ${notificationData.link || 'N/A'}\n\nBest,\nDr. Sam Reefath Radiology Academy`;
          const htmlMessage = `
            <p>Hi <strong>${user.name}</strong>,</p>
            <div style="background-color: #f9fafb; padding: 20px; border-left: 4px solid #0B1F4D; margin: 25px 0;">
              <p style="margin: 0; font-size: 16px;">${notificationData.message}</p>
            </div>
            ${!notificationData.link ? '<p>Best regards,<br/><strong>Dr. Sam Reefath Radiology Academy</strong></p>' : ''}
          `;
          const html = generateHTMLTemplate(
            notificationData.title, 
            htmlMessage, 
            notificationData.link ? 'View Details' : null, 
            notificationData.link || null
          );

          return sendEmail({
            email: user.email,
            subject: notificationData.title,
            message,
            html
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
