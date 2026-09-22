const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Course = require('../models/Course.model');
const User = require('../models/User.model');
const Payment = require('../models/Payment.model');
const { sendEmail, generateHTMLTemplate } = require('../utils/email.util');
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

    let basePrice = course.price > 0 ? course.price : 0; 
    if (course.earlyBird && course.earlyBird.enabled && (course.registrationCount || 0) < course.earlyBird.limit) {
      basePrice = course.earlyBird.price > 0 ? course.earlyBird.price : 0;
    }
    
    let totalPayable = basePrice;
    if (basePrice > 0) {
      totalPayable = Math.round((basePrice / 0.9764) * 100) / 100;
    } else {
      totalPayable = 1; // Fallback for razorpay minimum
    }
    
    const amountInPaise = Math.round(totalPayable * 100);

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
    
    let basePrice = course.price > 0 ? course.price : 0;
    if (course.earlyBird && course.earlyBird.enabled && (course.registrationCount || 0) < course.earlyBird.limit) {
      basePrice = course.earlyBird.price > 0 ? course.earlyBird.price : 0;
    }
    
    let totalPayable = basePrice;
    let paymentProcessingFee = 0;
    let gstOnProcessingFee = 0;
    
    if (basePrice > 0) {
      totalPayable = Math.round((basePrice / 0.9764) * 100) / 100;
      const totalProcessingFee = totalPayable - basePrice;
      paymentProcessingFee = Math.round((totalPayable * 0.02) * 100) / 100;
      gstOnProcessingFee = totalProcessingFee - paymentProcessingFee;
    }
    
    const userDoc = await User.findById(userId);

    // Save transaction in DB (use course._id for the ObjectId reference)
    const payment = await Payment.create({
      student: userId,
      course: course._id,
      amount: totalPayable,
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
    let user = await User.findOneAndUpdate(
      { _id: userId, 'enrolledCourses.course': { $ne: course._id } },
      { $push: { enrolledCourses: { course: course._id, progress: 0, validUntil } } },
      { new: true }
    );
    
    if (user) {
      // Newly enrolled, increment registration count
      await Course.findByIdAndUpdate(course._id, { $inc: { registrationCount: 1 } });
    } else {
      // User was already enrolled
      user = await User.findById(userId);
    }

    // Generate PDF Receipt
    const paymentData = {
      razorpayPaymentId: razorpay_payment_id,
      studentName: userDoc.name,
      studentEmail: userDoc.email,
      courseName: course.title,
      amount: totalPayable,
      baseAmount: basePrice,
      paymentProcessingFee,
      gstOnProcessingFee,
      currency: 'INR',
      type: 'Enrollment'
    };

    try {
      const pdfBuffer = await generateReceiptPDF(paymentData);

      // Email the student with the PDF attachment
      const message = `Dear ${userDoc.name},\n\nThank you for enrolling in ${course.title}.\n\nPayment Summary:\nCourse Fee: ₹${basePrice.toFixed(2)}\nPayment Processing Fee: ₹${paymentProcessingFee.toFixed(2)}\nGST on Processing Fee: ₹${gstOnProcessingFee.toFixed(2)}\nTotal Amount Paid: ₹${totalPayable.toFixed(2)}\n\nPlease find your detailed payment receipt attached.\n\nHappy Learning!`;
      const htmlMessage = `
        <p>Dear <strong>${userDoc.name}</strong>,</p>
        <p>Thank you for enrolling in <strong>${course.title}</strong>! We are thrilled to have you.</p>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #eeeeee;">
          <h3 style="margin-top: 0; color: #0B1F4D;">Payment Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee;">Course Fee:</td><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee; text-align: right; font-weight: bold;">₹${basePrice.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee;">Processing Fee:</td><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee; text-align: right;">₹${paymentProcessingFee.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee;">GST (18% on Processing):</td><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee; text-align: right;">₹${gstOnProcessingFee.toFixed(2)}</td></tr>
            <tr><td style="padding: 12px 0 0 0; color: #0B1F4D; font-weight: bold;">Total Amount Paid:</td><td style="padding: 12px 0 0 0; text-align: right; color: #0B1F4D; font-weight: bold; font-size: 18px;">₹${totalPayable.toFixed(2)}</td></tr>
          </table>
        </div>
        <p>Please find your detailed PDF payment receipt attached to this email.</p>
        <p>Happy Learning!</p>
      `;
      const html = generateHTMLTemplate('Your Course Receipt', htmlMessage);

      await sendEmail({
        email: userDoc.email,
        subject: `Your Receipt for ${course.title}`,
        message,
        html,
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
    const baseAmount = Math.round(4999 * 0.9764 * 100) / 100;
    const paymentProcessingFee = Math.round(4999 * 0.02 * 100) / 100;
    const gstOnProcessingFee = Math.round((4999 - baseAmount - paymentProcessingFee) * 100) / 100;

    const paymentData = {
      razorpayPaymentId: 'pay_SAMPLE1234567',
      studentName: 'John Doe',
      studentEmail: 'john.doe@example.com',
      courseName: 'Sample Medical Course',
      amount: 4999,
      baseAmount,
      paymentProcessingFee,
      gstOnProcessingFee,
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
      .populate('course', 'title duration');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
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

    const totalPayable = payment.amount || 0;
    const baseAmount = Math.round(totalPayable * 0.9764 * 100) / 100;
    const paymentProcessingFee = Math.round(totalPayable * 0.02 * 100) / 100;
    const gstOnProcessingFee = Math.round((totalPayable - baseAmount - paymentProcessingFee) * 100) / 100;

    const paymentData = {
      razorpayPaymentId: payment.razorpayPaymentId,
      studentName: payment.student.name,
      studentEmail: payment.student.email,
      courseName: payment.course.title,
      amount: totalPayable,
      baseAmount,
      paymentProcessingFee,
      gstOnProcessingFee,
      currency: payment.currency,
      type: payment.type || 'Enrollment'
    };

    const pdfBuffer = await generateReceiptPDF(paymentData);

    const message = `Dear ${payment.student.name},\n\nPayment Summary:\nCourse Fee: ₹${baseAmount.toFixed(2)}\nPayment Processing Fee: ₹${paymentProcessingFee.toFixed(2)}\nGST on Processing Fee: ₹${gstOnProcessingFee.toFixed(2)}\nTotal Amount Paid: ₹${totalPayable.toFixed(2)}\n\nPlease find your payment receipt attached.\n\nBest Regards,\nAdmin Team`;
    const htmlMessage = `
      <p>Dear <strong>${payment.student.name}</strong>,</p>
      <p>As requested, please find your payment receipt for <strong>${payment.course.title}</strong> attached.</p>
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #eeeeee;">
        <h3 style="margin-top: 0; color: #0B1F4D;">Payment Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee;">Course Fee:</td><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee; text-align: right; font-weight: bold;">₹${baseAmount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee;">Processing Fee:</td><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee; text-align: right;">₹${paymentProcessingFee.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee;">GST (18% on Processing):</td><td style="padding: 8px 0; border-bottom: 1px solid #eeeeee; text-align: right;">₹${gstOnProcessingFee.toFixed(2)}</td></tr>
          <tr><td style="padding: 12px 0 0 0; color: #0B1F4D; font-weight: bold;">Total Amount Paid:</td><td style="padding: 12px 0 0 0; text-align: right; color: #0B1F4D; font-weight: bold; font-size: 18px;">₹${totalPayable.toFixed(2)}</td></tr>
        </table>
      </div>
      <p>Best Regards,</p>
      <p>Admin Team</p>
    `;
    const html = generateHTMLTemplate('Your Course Receipt (Resent)', htmlMessage);

    await sendEmail({
      email: payment.student.email,
      subject: `Your Receipt for ${payment.course.title}`,
      message,
      html,
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
