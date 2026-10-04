const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mediacalkv';
mongoose.connect(mongoUri).then(async () => {
  const User = require('./src/models/User.model');
  const Course = require('./src/models/Course.model');
  const Payment = require('./src/models/Payment.model');
  
  const email = 'megha.damor26@gmail.com';
  const paymentId = 'pay_TjQLnh9gi5EJ7M';
  const courseId = '6aae81b19e7739c6e4987df2';
  
  // Find User
  const user = await User.findOne({ email });
  if (!user) {
    console.log('User not found!');
    process.exit(1);
  }
  console.log('Found user:', user.name);
  
  // Find Course
  const course = await Course.findById(courseId);
  if (!course) {
    console.log('Course not found!');
    process.exit(1);
  }
  console.log('Found course:', course.title);
  
  // Check if payment already exists
  const existingPayment = await Payment.findOne({ razorpayPaymentId: paymentId });
  if (existingPayment) {
    console.log('Payment already exists in DB!');
  } else {
    // Create Payment
    const payment = await Payment.create({
      student: user._id,
      course: course._id,
      amount: 1024.17,
      currency: 'INR',
      razorpayOrderId: 'order_webhook_recovery',
      razorpayPaymentId: paymentId,
      type: 'Enrollment',
      status: 'Success',
      createdAt: new Date('2026-10-03T17:16:54+05:30')
    });
    console.log('Created Payment record:', payment._id);
  }
  
  // Enroll user if not already enrolled
  const isEnrolled = user.enrolledCourses.some(ec => ec.course.toString() === course._id.toString());
  if (isEnrolled) {
    console.log('User is already enrolled in this course.');
  } else {
    let validUntil = null;
    if (course.duration && course.duration !== 'lifetime') {
      const days = parseInt(course.duration, 10);
      if (!isNaN(days)) {
        validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + days);
      }
    }
    
    await User.findByIdAndUpdate(user._id, {
      $push: { enrolledCourses: { course: course._id, progress: 0, validUntil } }
    });
    await Course.findByIdAndUpdate(course._id, { $inc: { registrationCount: 1 } });
    console.log('Successfully enrolled user in course.');
  }
  
  process.exit(0);
}).catch(console.error);
