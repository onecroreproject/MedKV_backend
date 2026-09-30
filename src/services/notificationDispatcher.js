const { createAndSendNotification } = require('../utils/notification.util');
const User = require('../models/User.model');

// Using the live URLs
const CLIENT_URL = process.env.CLIENT_URL || 'https://www.drsamreefathradiologyacademy.com';

/**
 * NOTIFICATION DISPATCHER SERVICE
 * Centralized service to handle all 30+ email and notification events across the platform.
 * Ensures consistent messaging and perfect live website deep-links.
 */

// 1. Student Registration / Welcome Email
exports.sendStudentRegistrationWelcome = async (userId, userName) => {
  await createAndSendNotification([userId], {
    title: 'Welcome to Dr. Sam Reefath Radiology Academy!',
    message: `Welcome aboard, ${userName}! We are thrilled to have you join our community. Your account has been successfully created. Explore our extensive curriculum and start your learning journey today.`,
    type: 'system',
    link: `${CLIENT_URL}/student/courses`
  });
};

// 2. Email Verification
exports.sendEmailVerification = async (userId, token) => {
  await createAndSendNotification([userId], {
    title: 'Verify Your Email Address',
    message: `Please verify your email address to unlock full access to the academy. Click the button below to complete your registration.`,
    type: 'system',
    link: `${CLIENT_URL}/verify-email?token=${token}`
  });
};

// 3. Course Purchase Confirmation
exports.sendCoursePurchaseConfirmation = async (userId, courseId, courseName) => {
  await createAndSendNotification([userId], {
    title: 'Course Purchase Successful!',
    message: `Thank you for enrolling in "${courseName}". You now have full access to the course materials.`,
    type: 'course',
    link: `${CLIENT_URL}/student/courses/${courseId}`
  });
};

// 4. Course Purchase Invoice
exports.sendCoursePurchaseInvoice = async (userId, invoiceId) => {
  await createAndSendNotification([userId], {
    title: `Invoice Generated: ${invoiceId}`,
    message: `Your payment invoice (${invoiceId}) has been generated and is ready for download in your dashboard.`,
    type: 'payment',
    link: `${CLIENT_URL}/student/dashboard?tab=payments`
  });
};

// 5. Payment Successful
exports.sendPaymentSuccessful = async (userId, amount) => {
  await createAndSendNotification([userId], {
    title: 'Payment Received Successfully',
    message: `We have successfully received your payment of ₹${amount}. Thank you!`,
    type: 'payment',
    link: `${CLIENT_URL}/student/dashboard?tab=payments`
  });
};

// 6. Payment Failed
exports.sendPaymentFailed = async (userId, reason) => {
  await createAndSendNotification([userId], {
    title: 'Payment Failed',
    message: `Unfortunately, your recent payment attempt failed. Reason: ${reason}. Please try again or contact support if the issue persists.`,
    type: 'payment',
    link: `${CLIENT_URL}/student/dashboard?tab=payments`
  });
};

// 7. New Course Published
exports.sendNewCoursePublished = async (courseId, courseName) => {
  const users = await User.find({ role: 'Student', isActive: true }).select('_id');
  const userIds = users.map(u => u._id);
  await createAndSendNotification(userIds, {
    title: 'New Course Available!',
    message: `We have just published a highly requested new course: "${courseName}". Enroll now to secure your spot!`,
    type: 'course',
    link: `${CLIENT_URL}/student/courses/${courseId}`
  });
};

// 8. Course Starting Soon
exports.sendCourseStartingSoon = async (userIds, courseId, courseName) => {
  await createAndSendNotification(userIds, {
    title: 'Course Starting Soon',
    message: `Get ready! Your course "${courseName}" is starting very soon. Check the curriculum for details.`,
    type: 'course',
    link: `${CLIENT_URL}/student/courses/${courseId}`
  });
};

// 9. Course Date/Time Changed
exports.sendCourseDateChanged = async (userIds, courseId, courseName) => {
  await createAndSendNotification(userIds, {
    title: 'Course Schedule Updated',
    message: `The schedule for "${courseName}" has been updated. Please check the course page for the latest timings.`,
    type: 'course',
    link: `${CLIENT_URL}/student/courses/${courseId}`
  });
};

// 10. Course Cancelled
exports.sendCourseCancelled = async (userIds, courseName) => {
  await createAndSendNotification(userIds, {
    title: 'Course Cancelled',
    message: `We regret to inform you that "${courseName}" has been cancelled. Our support team will reach out to you regarding alternatives or refunds.`,
    type: 'course',
    link: `${CLIENT_URL}/student/dashboard`
  });
};

// 11. Course Content Updated
exports.sendCourseContentUpdated = async (userIds, courseId, courseName) => {
  await createAndSendNotification(userIds, {
    title: 'Course Content Updated',
    message: `New materials or lectures have been added to "${courseName}". Dive back in to see what's new!`,
    type: 'course',
    link: `${CLIENT_URL}/student/courses/${courseId}`
  });
};

// 12. Live Class Scheduled
exports.sendLiveClassScheduled = async (userIds, courseId, courseName, classTitle, time, calendarLink) => {
  await createAndSendNotification(userIds, {
    title: 'New Live Class Scheduled',
    message: `A new live class "${classTitle}" has been scheduled for "${courseName}" at ${time}.`,
    type: 'live_class',
    link: courseId ? `${CLIENT_URL}/student/courses/${courseId}?tab=liveclasses` : `${CLIENT_URL}/student/dashboard?tab=liveclasses`,
    calendarLink
  });
};

// 13. Live Class Reminder
exports.sendLiveClassReminder = async (userIds, courseId, classTitle, time) => {
  await createAndSendNotification(userIds, {
    title: 'Reminder: Live Class Starting Soon',
    message: `Your live class "${classTitle}" will begin at ${time}. Don't be late!`,
    type: 'live_class',
    link: courseId ? `${CLIENT_URL}/student/courses/${courseId}?tab=liveclasses` : `${CLIENT_URL}/student/dashboard?tab=liveclasses`
  });
};

// 14. Live Class Rescheduled
exports.sendLiveClassRescheduled = async (userIds, courseId, classTitle, newTime, calendarLink) => {
  await createAndSendNotification(userIds, {
    title: 'Live Class Rescheduled',
    message: `Please note that "${classTitle}" has been rescheduled to ${newTime}.`,
    type: 'live_class',
    link: courseId ? `${CLIENT_URL}/student/courses/${courseId}?tab=liveclasses` : `${CLIENT_URL}/student/dashboard?tab=liveclasses`,
    calendarLink
  });
};

// 15. Live Class Cancelled
exports.sendLiveClassCancelled = async (userIds, courseId, classTitle) => {
  await createAndSendNotification(userIds, {
    title: 'Live Class Cancelled',
    message: `The live class "${classTitle}" has been cancelled. Keep an eye out for rescheduling announcements.`,
    type: 'live_class',
    link: courseId ? `${CLIENT_URL}/student/courses/${courseId}?tab=liveclasses` : `${CLIENT_URL}/student/dashboard?tab=liveclasses`
  });
};

// 16. Live Class Recording Uploaded
exports.sendRecordingUploaded = async (userIds, courseId, classTitle) => {
  await createAndSendNotification(userIds, {
    title: 'Class Recording Available',
    message: `Missed the class? The recording for "${classTitle}" is now available in your course portal.`,
    type: 'recording',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=recordings`
  });
};

// 17. Live Class Recording Updated/Replaced
exports.sendRecordingUpdated = async (userIds, courseId, classTitle) => {
  await createAndSendNotification(userIds, {
    title: 'Recording Updated',
    message: `A better quality or updated recording for "${classTitle}" has been uploaded.`,
    type: 'recording',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=recordings`
  });
};

// 18. Assignment Published
exports.sendAssignmentPublished = async (userIds, courseId, assignmentTitle) => {
  await createAndSendNotification(userIds, {
    title: 'New Assignment Published',
    message: `A new assignment "${assignmentTitle}" has been posted. Be sure to check the deadline!`,
    type: 'assignment',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=assignments`
  });
};

// 19. Assignment Deadline Changed
exports.sendAssignmentDeadlineChanged = async (userIds, courseId, assignmentTitle, newDeadline) => {
  await createAndSendNotification(userIds, {
    title: 'Assignment Deadline Extended',
    message: `The deadline for "${assignmentTitle}" has been updated to ${newDeadline}.`,
    type: 'assignment',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=assignments`
  });
};

// 20. Exam/Assessment Published
exports.sendExamPublished = async (userIds, courseId, examTitle) => {
  await createAndSendNotification(userIds, {
    title: 'New Exam Available',
    message: `An assessment "${examTitle}" is now active in your course.`,
    type: 'exam',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=exams`
  });
};

// 21. Exam Schedule Changed
exports.sendExamScheduleChanged = async (userIds, courseId, examTitle, newSchedule) => {
  await createAndSendNotification(userIds, {
    title: 'Exam Schedule Updated',
    message: `The schedule for "${examTitle}" has been changed to ${newSchedule}.`,
    type: 'exam',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=exams`
  });
};

// 22. Exam Reminder
exports.sendExamReminder = async (userIds, courseId, examTitle, time) => {
  await createAndSendNotification(userIds, {
    title: 'Exam Reminder',
    message: `Don't forget! Your exam "${examTitle}" is scheduled for ${time}. Good luck!`,
    type: 'exam',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=exams`
  });
};

// 23. Exam Result Published
exports.sendExamResultPublished = async (userId, courseId, examTitle) => {
  await createAndSendNotification([userId], {
    title: 'Exam Results Available',
    message: `Your results for "${examTitle}" have been published. Check your performance now.`,
    type: 'exam',
    link: `${CLIENT_URL}/student/courses/${courseId}?tab=exams`
  });
};

// 24. Course Completed
exports.sendCourseCompleted = async (userId, courseId, courseName) => {
  await createAndSendNotification([userId], {
    title: 'Congratulations! Course Completed',
    message: `Incredible work! You have successfully completed "${courseName}".`,
    type: 'course',
    link: `${CLIENT_URL}/student/courses/${courseId}`
  });
};

// 25. Certificate Available
exports.sendCertificateAvailable = async (userId, courseName) => {
  await createAndSendNotification([userId], {
    title: 'Your Certificate is Ready!',
    message: `Your certificate of completion for "${courseName}" is now available to download and share.`,
    type: 'system',
    link: `${CLIENT_URL}/student/dashboard?tab=certificates`
  });
};

// 26. Important Course Announcement
exports.sendCourseAnnouncement = async (userIds, courseId, announcementTitle) => {
  await createAndSendNotification(userIds, {
    title: `Announcement: ${announcementTitle}`,
    message: `A new important announcement has been posted by your instructor.`,
    type: 'course',
    link: `${CLIENT_URL}/student/courses/${courseId}`
  });
};

// 27. Faculty Announcement
exports.sendFacultyAnnouncement = async (userIds, facultyName) => {
  await createAndSendNotification(userIds, {
    title: `Message from ${facultyName}`,
    message: `Dr. ${facultyName} has posted a new announcement for students.`,
    type: 'system',
    link: `${CLIENT_URL}/student/dashboard`
  });
};

// 28. Password Reset
// Note: Handled independently in auth.service for security, but exposed here if needed.
exports.sendPasswordResetConfirmation = async (userId) => {
  await createAndSendNotification([userId], {
    title: 'Password Changed Successfully',
    message: `Your account password was recently changed. If this wasn't you, please contact support immediately.`,
    type: 'security',
    link: `${CLIENT_URL}/student/dashboard?tab=settings`
  });
};

// 29. Account/Security Change Notification
exports.sendSecurityAlert = async (userId, detail) => {
  await createAndSendNotification([userId], {
    title: 'Security Alert: Account Changes',
    message: `We detected a change in your account settings: ${detail}. If this was unauthorized, contact us.`,
    type: 'security',
    link: `${CLIENT_URL}/student/dashboard?tab=settings`
  });
};

// 30. Refund Confirmation
exports.sendRefundConfirmation = async (userId, amount) => {
  await createAndSendNotification([userId], {
    title: 'Refund Processed',
    message: `A refund of ₹${amount} has been successfully processed to your original payment method.`,
    type: 'payment',
    link: `${CLIENT_URL}/student/dashboard?tab=payments`
  });
};
