const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User.model');
const Course = require('./src/models/Course.model');
const Payment = require('./src/models/Payment.model');

const checkUser = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const userId = '6ab920170b46ced8b109418c';
    const courseId = '6ab125359e7739c6e49881a6';
    const phone = '9493431912';

    let user = await User.findById(userId);
    if (!user) {
      user = await User.findOne({ phoneNumber: { $regex: phone } });
    }

    if (user) {
      console.log('User found:');
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Phone: ${user.phoneNumber}`);
      console.log(`Enrolled Courses:`, user.enrolledCourses.map(e => e.course.toString()));
      
      const isEnrolled = user.enrolledCourses.some(e => e.course.toString() === courseId);
      console.log(`Is enrolled in course ${courseId}: ${isEnrolled}`);
    } else {
      console.log('User not found');
    }

    const payment = await Payment.findOne({ student: userId, course: courseId });
    if (payment) {
        console.log('Payment record found:');
        console.log(payment);
    } else {
        console.log('No payment record found for this user and course.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
};

checkUser();
