require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User.model');
const Course = require('./src/models/Course.model');

async function updateEnrollments() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    const users = await User.find({ 'enrolledCourses.0': { $exists: true } });
    console.log(`Found ${users.length} users with enrollments.`);

    let updatedCount = 0;

    for (let user of users) {
      let modified = false;
      
      for (let enrollment of user.enrolledCourses) {
        if (enrollment.validUntil === undefined) {
          const course = await Course.findById(enrollment.course);
          if (course) {
            if (!course.duration || course.duration === 'lifetime') {
              enrollment.validUntil = null;
            } else {
              const days = parseInt(course.duration, 10);
              if (!isNaN(days)) {
                const enrolledDate = new Date(enrollment.enrolledAt);
                const validUntil = new Date(enrolledDate);
                validUntil.setDate(validUntil.getDate() + days);
                enrollment.validUntil = validUntil;
              } else {
                enrollment.validUntil = null;
              }
            }
            modified = true;
          }
        }
      }

      if (modified) {
        // Also ensure recordingExtensions is removed or set to undefined
        user.recordingExtensions = undefined; 
        await user.save();
        updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

updateEnrollments();
