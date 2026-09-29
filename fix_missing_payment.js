const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/mediacalkv').then(async () => {
  const User = require('./src/models/User.model');
  const Course = require('./src/models/Course.model');
  const Payment = require('./src/models/Payment.model');
  
  const email = 'niveditavn4497@gmail.com';
  const paymentId = 'pay_ThLLjsJPZlroWy';
  
  // Find User
  const user = await User.findOne({ email });
  if (!user) {
    console.log('User not found!');
    process.exit(1);
  }
  console.log('Found user:', user.name);
  
  // Find Course
  const course = await Course.findOne({ title: { $regex: 'Long Case', $options: 'i' } });
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
      razorpayOrderId: 'MANUAL_RECOVERY', // We don't have the order ID from screenshot
      razorpayPaymentId: paymentId,
      type: 'Enrollment',
      status: 'Success',
      createdAt: new Date('2026-09-28T11:05:00+05:30') // Approximate from screenshot
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
