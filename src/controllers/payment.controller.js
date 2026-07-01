const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Course = require('../models/Course.model');
const User = require('../models/User.model');
const Payment = require('../models/Payment.model');
const sendEmail = require('../utils/email.util');
const { generateReceiptPDF } = require('../utils/pdf.util');

// Helper: find course by MongoDB _id OR by slug string
const findCourseByIdOrSlug = async (courseId) => {
  if (mongoose.Types.ObjectId.isValid(courseId)) {
    return await Course.findById(courseId);
  }
  return await Course.findOne({ slug: courseId });
};

// Initialize Razorpay instance
// Note: In production, ensure these keys are strictly set in .env
const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are missing in environment variables');
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// @desc    Create Razorpay Order for a Course
// @route   POST /api/v1/payment/create-order
// @access  Private (Student)
exports.createOrder = async (req, res) => {
  try {
    const { courseId } = req.body;
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' });
    }

    const course = await findCourseByIdOrSlug(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const priceInRupees = course.price > 0 ? course.price : 1; 
    const amountInPaise = priceInRupees * 100;

    const razorpay = getRazorpayInstance();
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      // Razorpay receipt max 40 chars
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    if (!order) {
      return res.status(500).json({ success: false, message: 'Failed to create order with Razorpay' });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        courseId: course._id,
        courseName: course.title,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    const errDetail = error?.error?.description || error?.message || JSON.stringify(error);
    console.error("Razorpay Create Order Error:", errDetail);
    res.status(500).json({ success: false, message: errDetail });
  }
};

// @desc    Verify Razorpay Payment Signature & Enroll User
// @route   POST /api/v1/payment/verify
// @access  Private (Student)
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId } = req.body;
    const userId = req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courseId) {
      return res.status(400).json({ success: false, message: 'Missing required payment verification details' });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
    }

    // Signature verified. Retrieve data for receipt
    const course = await findCourseByIdOrSlug(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found after payment.' });
    }
    const priceInRupees = course.price > 0 ? course.price : 1;
    const userDoc = await User.findById(userId);

    // Save transaction in DB (use course._id for the ObjectId reference)
    const payment = await Payment.create({
      student: userId,
      course: course._id,
      amount: priceInRupees,
      currency: 'INR',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      type: 'Enrollment',
      status: 'Success'
    });

    let validUntil = null;
    if (course.duration && course.duration !== 'lifetime') {
      const days = parseInt(course.duration, 10);
      if (!isNaN(days)) {
        validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + days);
      }
    }

    // Enroll User (always use the real ObjectId course._id)
    const user = await User.findOneAndUpdate(
      { _id: userId, 'enrolledCourses.course': { $ne: course._id } },
      { $push: { enrolledCourses: { course: course._id, progress: 0, validUntil } } },
      { new: true }
    );

    // Generate PDF Receipt
    const paymentData = {
      razorpayPaymentId: razorpay_payment_id,
      studentName: userDoc.name,
      studentEmail: userDoc.email,
      courseName: course.title,
      amount: priceInRupees,
      currency: 'INR',
      type: 'Enrollment'
    };

    try {
      const pdfBuffer = await generateReceiptPDF(paymentData);

      // Email the student with the PDF attachment
      await sendEmail({
        email: userDoc.email,
        subject: `Your Receipt for ${course.title}`,
        message: `Dear ${userDoc.name},\n\nThank you for enrolling in ${course.title}. Please find your payment receipt attached.\n\nHappy Learning!`,
        attachments: [
          {
            filename: `Receipt_${razorpay_payment_id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      });
      console.log(`Receipt emailed to ${userDoc.email}`);
    } catch (pdfErr) {
      console.error("Failed to generate or send PDF receipt:", pdfErr);
      // We don't fail the verification if the email fails, just log it.
    }

    res.status(200).json({
      success: true,
      message: 'Payment successful and user enrolled',
      data: user ? user.enrolledCourses : []
    });

  } catch (error) {
    console.error("Razorpay Verify Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all payments (Sales & Receipts)
// @route   GET /api/v1/payment
// @access  Private (Admin)
exports.getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('student', 'name email')
      .populate('course', 'title category')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Download Sample Receipt PDF
// @route   GET /api/v1/payment/sample-receipt
// @access  Private (Admin)
exports.downloadSampleReceipt = async (req, res) => {
  try {
    const paymentData = {
      razorpayPaymentId: 'pay_SAMPLE1234567',
      studentName: 'John Doe',
      studentEmail: 'john.doe@example.com',
      courseName: 'Sample Medical Course',
      amount: 4999,
      currency: 'INR',
      type: 'Enrollment'
    };

    const pdfBuffer = await generateReceiptPDF(paymentData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Sample_Receipt.pdf"`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error("Download Sample Receipt Error:", error);
    res.status(500).json({ success: false, message: 'Failed to generate sample receipt PDF' });
  }
};

// @desc    Download Receipt PDF
// @route   GET /api/v1/payment/:id/receipt
// @access  Private (Admin)
exports.downloadReceipt = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('student', 'name email')
      .populate('course', 'title');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const paymentData = {
      razorpayPaymentId: payment.razorpayPaymentId,
      studentName: payment.student.name,
      studentEmail: payment.student.email,
      courseName: payment.course.title,
      amount: payment.amount,
      currency: payment.currency,
      type: payment.type || 'Enrollment'
    };

    const pdfBuffer = await generateReceiptPDF(paymentData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Receipt_${payment.razorpayPaymentId}.pdf"`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error("Download Receipt Error:", error);
    res.status(500).json({ success: false, message: 'Failed to generate receipt PDF' });
  }
};

// @desc    Resend Receipt Email
// @route   POST /api/v1/payment/:id/resend-receipt
// @access  Private (Admin)
exports.resendReceipt = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('student', 'name email')
      .populate('course', 'title');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const paymentData = {
      razorpayPaymentId: payment.razorpayPaymentId,
      studentName: payment.student.name,
      studentEmail: payment.student.email,
      courseName: payment.course.title,
      amount: payment.amount,
      currency: payment.currency,
      type: payment.type || 'Enrollment'
    };

    const pdfBuffer = await generateReceiptPDF(paymentData);

    await sendEmail({
      email: payment.student.email,
      subject: `Your Receipt for ${payment.course.title}`,
      message: `Dear ${payment.student.name},\n\nPlease find your payment receipt attached.\n\nBest Regards,\nAdmin Team`,
      attachments: [
        {
          filename: `Receipt_${payment.razorpayPaymentId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    res.status(200).json({ success: true, message: 'Receipt resent successfully' });
  } catch (error) {
    console.error("Resend Receipt Error:", error);
    res.status(500).json({ success: false, message: 'Failed to resend receipt email' });
  }
};
