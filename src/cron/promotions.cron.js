const cron = require('node-cron');
const User = require('../models/User.model');
const Course = require('../models/Course.model');
const { createAndSendNotification } = require('../utils/notification.util');

// Run every Monday at 10:00 AM ('0 10 * * 1')
const schedulePromotions = () => {
  cron.schedule('0 10 * * 1', async () => {
    console.log('Running weekly promotional emails cron job...');
    try {
      const students = await User.find({ role: 'Student', isActive: true }).populate('enrolledCourses.course');
      const allCourses = await Course.find({ isPublished: true, isDeleted: false });

      if (allCourses.length === 0) return;

      for (const student of students) {
        const enrolledCourseIds = student.enrolledCourses.map(ec => ec.course ? ec.course._id.toString() : null).filter(Boolean);
        const unenrolledCourses = allCourses.filter(c => !enrolledCourseIds.includes(c._id.toString()));

        if (unenrolledCourses.length === 0) continue; // Enrolled in everything, skip

        // Pick a random unenrolled course to promote
        const randomCourse = unenrolledCourses[Math.floor(Math.random() * unenrolledCourses.length)];

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

        // Send email
        await createAndSendNotification(
          [student._id],
          { title: selectedTemplate.title, message: selectedTemplate.message, type: 'promotional' },
          true // Send email
        );
      }
      
      console.log('Weekly promotional emails sent successfully.');
    } catch (error) {
      console.error('Error in promotional cron job:', error);
    }
  });
};

module.exports = { schedulePromotions };
