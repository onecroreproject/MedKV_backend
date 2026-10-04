require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('./src/models/Payment.model');
const User = require('./src/models/User.model');

const checkDb = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    
    const pid = 'pay_TjQLnh9gi5EJ7M';
    console.log(`\n--- Checking DB for Payment ID: ${pid} ---`);
    
    const payment = await Payment.findOne({ razorpayPaymentId: pid }).populate('course student');
    if (payment) {
      console.log('Payment found in DB!');
      console.log('Student:', payment.student ? payment.student.email : 'None');
      console.log('Course:', payment.course ? payment.course.title : 'None');
      console.log('Status:', payment.status);
    } else {
      console.log('Payment NOT found in DB.');
    }
  } catch(e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
  }
};

checkDb();
