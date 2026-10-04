const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User.model');
const Course = require('./src/models/Course.model');
const Payment = require('./src/models/Payment.model');

const emails = ['megha.damor26@gmail.com', 'paritatalaulikar597@gmail.com'];

const checkUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const email of emails) {
      console.log(`\n--- Checking email: ${email} ---`);
      const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') }).populate('enrolledCourses.course');
      
      if (user) {
        console.log(`User found: ${user.name}`);
        if (user.enrolledCourses && user.enrolledCourses.length > 0) {
            console.log('Courses enrolled:');
            user.enrolledCourses.forEach(ec => {
                const courseName = ec.course ? ec.course.title : 'Unknown Course (or ID: ' + ec.course + ')';
                console.log(` - ${courseName}`);
            });
        } else {
            console.log('No enrolled courses found in user document.');
        }

        // Also check Payments to be sure
        const payments = await Payment.find({ student: user._id }).populate('course');
        if (payments && payments.length > 0) {
            console.log('Payments found in DB:');
            payments.forEach(p => {
                 const courseName = p.course ? p.course.title : 'Unknown Course (or ID: ' + p.course + ')';
                 console.log(` - Course: ${courseName}`);
                 console.log(`   Amount: ${p.amount} ${p.currency || 'INR'}`);
                 console.log(`   Status: ${p.status}`);
                 console.log(`   Razorpay Order ID: ${p.razorpayOrderId || 'N/A'}`);
                 console.log(`   Razorpay Payment ID: ${p.razorpayPaymentId || 'N/A'}`);
                 console.log(`   Date: ${p.createdAt}`);
            });
        } else {
            console.log('No payments found.');
        }
      } else {
        console.log('User not found in database.');
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
};

checkUsers();
