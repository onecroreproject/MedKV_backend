const cron = require('node-cron');
const User = require('../models/User.model');
const Course = require('../models/Course.model');
const { createAndSendNotification } = require('../utils/notification.util');
const { sendEmail, generateHTMLTemplate } = require('../utils/email.util');

/**
 * Executes the promotional email campaign.
 * Can be called automatically by the cron scheduler or manually via Admin API.
 */
const executePromotions = async ({ isTest = false, testEmail = null, limit = null } = {}) => {
  console.log(`[PROMOTIONS] Starting promotional email dispatch (isTest: ${isTest})...`);
  try {
    const allCourses = await Course.find({ status: 'Published' });
    if (allCourses.length === 0) {
      console.warn('[PROMOTIONS] No published courses found. Aborting.');
      return { success: false, message: 'No published courses found', sentCount: 0 };
    }

    const clientUrl = process.env.CLIENT_URL || 'https://www.drsamreefathradiologyacademy.com';

    // If test mode with specific recipient
    if (isTest && testEmail) {
      const sampleCourse = allCourses[Math.floor(Math.random() * allCourses.length)];
      const sampleLink = `${clientUrl}/courses/${sampleCourse.slug || sampleCourse._id}`;
      const sampleTitle = `Special Recommendation: ${sampleCourse.title}`;
      const sampleMessage = `Dear Doctor,\n\nWe would like to highlight "${sampleCourse.title}". This course is packed with high-yield radiology cases, mock exams, and board-level masterclasses.\n\nExplore the curriculum today to accelerate your career!`;

      const htmlBody = `
        <p>Hi <strong>Doctor</strong>,</p>
        <div style="background-color: #f9fafb; padding: 20px; border-left: 4px solid #0B1F4D; margin: 25px 0;">
          <div style="margin: 0; font-size: 16px; white-space: pre-line; line-height: 1.6;">${sampleMessage}</div>
        </div>
      `;
      const html = generateHTMLTemplate(
        sampleTitle,
        htmlBody,
        'Explore Course',
        sampleLink
      );

      await sendEmail({
        email: testEmail,
        subject: `[PROMOTION TEST] ${sampleTitle}`,
        message: `${sampleMessage}\n\nExplore: ${sampleLink}`,
        html
      });

      console.log(`[PROMOTIONS] Test promotional email sent directly to ${testEmail}`);
      return {
        success: true,
        message: `Test email successfully sent to ${testEmail}`,
        sentCount: 1,
        course: sampleCourse.title,
        link: sampleLink
      };
    }

    let students = await User.find({ role: 'Student', isActive: true }).populate('enrolledCourses.course');
    if (limit && typeof limit === 'number') {
      students = students.slice(0, limit);
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const student of students) {
      const enrolledCourseIds = student.enrolledCourses
        .map(ec => ec.course ? ec.course._id.toString() : null)
        .filter(Boolean);

      const unenrolledCourses = allCourses.filter(c => !enrolledCourseIds.includes(c._id.toString()));

      if (unenrolledCourses.length === 0) {
        skippedCount++;
        continue; // Enrolled in everything, skip
      }

      // Pick a random unenrolled course to promote
      const randomCourse = unenrolledCourses[Math.floor(Math.random() * unenrolledCourses.length)];
      const courseLink = `${clientUrl}/courses/${randomCourse.slug || randomCourse._id}`;

      // 5 Templates for Fresh Students (0 enrollments)
      const freshTemplates = [
        {
          title: `Kickstart your learning with ${randomCourse.title}!`,
          message: `Hi ${student.name || 'Student'},\n\nWe noticed you haven't enrolled in any courses yet. Why not start with our highly-rated course: "${randomCourse.title}"?\n\nIt's a great time to begin your journey with Dr. Sam Reefath Radiology Academy! Head over to your dashboard to check it out.`
        },
        {
          title: `Ready to dive in? Check out ${randomCourse.title}`,
          message: `Hello ${student.name || 'Student'},\n\nWelcome to the academy! We wanted to personally recommend "${randomCourse.title}" as an excellent starting point for your education.\n\nDon't wait—secure your spot today and start learning immediately.`
        },
        {
          title: `Your next big step: ${randomCourse.title}`,
          message: `Hi ${student.name || 'Student'},\n\nAre you looking for the perfect course to kick off your studies? "${randomCourse.title}" is one of our most popular offerings.\n\nLog in today and see why so many students love this course!`
        },
        {
          title: `Special Recommendation: ${randomCourse.title}`,
          message: `Dear ${student.name || 'Student'},\n\nSince you recently joined us, we wanted to highlight "${randomCourse.title}". This course is packed with valuable insights and practical knowledge.\n\nExplore the curriculum on our platform today.`
        },
        {
          title: `Begin your journey today with ${randomCourse.title}`,
          message: `Hi ${student.name || 'Student'},\n\nThere has never been a better time to start learning. We highly recommend "${randomCourse.title}" to get you up to speed.\n\nVisit the academy portal to enroll and unlock your full potential.`
        }
      ];

      // 5 Templates for Active Students (>0 enrollments)
      const activeTemplates = [
        {
          title: `Take your skills further with ${randomCourse.title}`,
          message: `Hi ${student.name || 'Student'},\n\nYou're already making great progress in your current courses! Have you considered taking your skills to the next level with "${randomCourse.title}"?\n\nThis course is a great addition to your current learning path. Enroll today and continue expanding your knowledge!`
        },
        {
          title: `Level up your expertise: ${randomCourse.title}`,
          message: `Hello ${student.name || 'Student'},\n\nBased on your active enrollment, we think you would absolutely love "${randomCourse.title}".\n\nIt perfectly complements your existing studies. Check it out before the next batch fills up!`
        },
        {
          title: `Continue your momentum with ${randomCourse.title}`,
          message: `Hi ${student.name || 'Student'},\n\nDon't stop now! Keep your learning momentum going by adding "${randomCourse.title}" to your library.\n\nOur top students often pair their current courses with this one.`
        },
        {
          title: `Expand your horizon: ${randomCourse.title}`,
          message: `Dear ${student.name || 'Student'},\n\nGreat job on your studies so far! We wanted to bring "${randomCourse.title}" to your attention, as it is highly relevant to your educational journey.\n\nLog in to discover what you can learn next.`
        },
        {
          title: `A perfect match for you: ${randomCourse.title}`,
          message: `Hi ${student.name || 'Student'},\n\nWe constantly review our catalog to find the best fit for our students. We strongly recommend adding "${randomCourse.title}" to your schedule.\n\nExpand your expertise and stay ahead of the curve!`
        }
      ];

      let selectedTemplate;
      if (enrolledCourseIds.length === 0) {
        selectedTemplate = freshTemplates[Math.floor(Math.random() * freshTemplates.length)];
      } else {
        selectedTemplate = activeTemplates[Math.floor(Math.random() * activeTemplates.length)];
      }

      try {
        // Send in-app notification and email with direct link
        await createAndSendNotification(
          [student._id],
          {
            title: selectedTemplate.title,
            message: selectedTemplate.message,
            type: 'promotional',
            link: courseLink
          },
          true // Send email
        );
        sentCount++;
      } catch (studentErr) {
        console.error(`[PROMOTIONS] Failed sending to student ${student.email || student._id}:`, studentErr.message);
      }

      // Log progress every 15 students
      if ((sentCount + skippedCount) % 15 === 0 || (sentCount + skippedCount) === students.length) {
        console.log(`[PROMOTIONS] Progress: ${sentCount} sent / ${students.length} students processed.`);
      }

      // Gentle pause to avoid flooding GoDaddy SMTP relay
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    console.log(`[PROMOTIONS] Promotional campaign completed. Sent: ${sentCount}, Skipped: ${skippedCount}`);
    return { success: true, sentCount, skippedCount, totalStudents: students.length };
  } catch (error) {
    console.error('[PROMOTIONS] Error in promotional execution:', error);
    return { success: false, error: error.message };
  }
};

// Run every Monday at 10:00 AM ('0 10 * * 1')
const schedulePromotions = () => {
  cron.schedule('0 10 * * 1', async () => {
    console.log('Running weekly promotional emails cron job...');
    await executePromotions();
  });
};

module.exports = { schedulePromotions, executePromotions };
