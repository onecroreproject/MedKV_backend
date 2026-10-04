require('dotenv').config();
const mongoose = require('mongoose');

const updateValidities = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected to DB...');

    const Course = require('./src/models/Course.model');
    const Recording = require('./src/models/Recording.model');
    const User = require('./src/models/User.model');

    const courses = await Course.find();
    console.log(`Found ${courses.length} courses to process.`);

    for (const course of courses) {
      console.log(`\nProcessing Course: ${course.title} (ID: ${course._id})`);
      
      // Find the earliest recording for this course
      const firstRecording = await Recording.findOne({ course: course._id }).sort({ createdAt: 1 });
      
      if (firstRecording) {
        console.log(` - First video found. Uploaded at: ${firstRecording.createdAt}`);
        course.videoUploadedAt = firstRecording.createdAt;
        await course.save();

        if (course.duration && course.duration !== 'lifetime') {
          const days = parseInt(course.duration, 10);
          if (!isNaN(days)) {
            const validUntil = new Date(course.videoUploadedAt);
            validUntil.setDate(validUntil.getDate() + days);

            const result = await User.updateMany(
              { "enrolledCourses.course": course._id },
              { "$set": { "enrolledCourses.$[elem].validUntil": validUntil } },
              { arrayFilters: [ { "elem.course": course._id } ] }
            );
            console.log(` - Updated validUntil to ${validUntil} for ${result.modifiedCount} enrolled students.`);
          }
        }
      } else {
        console.log(` - No videos uploaded for this course yet.`);
        course.videoUploadedAt = null;
        await course.save();

        // Ensure users don't expire prematurely if no video is uploaded
        const result = await User.updateMany(
          { "enrolledCourses.course": course._id },
          { "$set": { "enrolledCourses.$[elem].validUntil": null } },
          { arrayFilters: [ { "elem.course": course._id } ] }
        );
        console.log(` - Reset validUntil to null (waiting for video) for ${result.modifiedCount} enrolled students.`);
      }
    }
    console.log('\nAll done processing validities!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    mongoose.disconnect();
  }
};

updateValidities();
