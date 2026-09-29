const mongoose = require('mongoose');
require('dotenv').config();
const { generateReceiptPDF } = require('./src/utils/pdf.util');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mediacalkv';
mongoose.connect(mongoUri).then(async () => {
  const User = require('./src/models/User.model');
  const Course = require('./src/models/Course.model');
  const Payment = require('./src/models/Payment.model');

  const payment = await Payment.findOne({ razorpayPaymentId: 'pay_ThLLjsJPZlroWy' })
    .populate('student', 'name email')
    .populate('course', 'title duration');

  if (!payment) {
    console.log('Payment not found');
    process.exit(1);
  }

  const totalPayable = payment.amount || 0;
  const baseAmount = Math.round(totalPayable * 0.9764 * 100) / 100;
  const paymentProcessingFee = Math.round(totalPayable * 0.02 * 100) / 100;
  const gstOnProcessingFee = Math.round((totalPayable - baseAmount - paymentProcessingFee) * 100) / 100;

  const paymentData = {
    razorpayPaymentId: payment.razorpayPaymentId,
    studentName: payment.student.name,
    studentEmail: payment.student.email,
    courseName: payment.course?.title,
    courseDuration: payment.course?.duration,
    amount: totalPayable,
    baseAmount,
    paymentProcessingFee,
    gstOnProcessingFee,
    currency: payment.currency,
    type: payment.type || 'Enrollment',
    invoiceNumber: `INV-${payment._id.toString().slice(-6).toUpperCase()}`
  };

  try {
    const pdfBuffer = await generateReceiptPDF(paymentData);
    console.log('PDF generated successfully, size:', pdfBuffer.length);
    
    // Simulate express res.set
    const filename = `${payment.student.name.replace(/\s+/g, '_')}_Receipt_${payment.razorpayPaymentId}.pdf`;
    console.log('Filename:', filename);
    
    const http = require('http');
    const OutgoingMessage = http.OutgoingMessage;
    const res = new OutgoingMessage();
    try {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      console.log('Header set successfully');
    } catch (e) {
      console.log('Header error:', e.message);
    }

  } catch (err) {
    console.log('PDF generation error:', err);
  }

  process.exit(0);
}).catch(console.error);
