const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/mediacalkv').then(async () => {
  const User = require('./src/models/User.model');
  const Payment = require('./src/models/Payment.model');
  
  const users = await User.find({ phoneNumber: { $regex: '8547866594|8547 866594', $options: 'i' } });
  console.log('Users found by phone:', users.map(u => ({ id: u._id, name: u.name, email: u.email, phone: u.phoneNumber })));
  
  for(const u of users) {
    const payments = await Payment.find({ student: u._id });
    console.log('Payments for', u.email, ':', payments.map(p => p.razorpayPaymentId));
  }
  
  const allPayments = await Payment.find({ razorpayPaymentId: { $in: ['pay_ThLRDUyludcKpS', 'pay_ThLN6svzgTkloL', 'pay_ThLLjsJPZlroWy'] } }).populate('student', 'name email phoneNumber');
  console.log('Specific Payments in DB:', allPayments.map(p => ({ 
    id: p.razorpayPaymentId, 
    studentId: p.student?._id,
    studentName: p.student?.name,
    studentEmail: p.student?.email,
    studentPhone: p.student?.phoneNumber
  })));
  
  process.exit(0);
}).catch(console.error);
