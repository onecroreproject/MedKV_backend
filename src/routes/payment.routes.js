const express = require('express');
const { createOrder, verifyPayment, getAllPayments, downloadReceipt, resendReceipt, downloadSampleReceipt, razorpayWebhook } = require('../controllers/payment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Webhook Route (MUST be public, no protect middleware)
router.post('/webhook', razorpayWebhook);

router.use(protect); // Ensure all payment routes below require authentication

// Student Routes
router.post('/create-order', authorize('Student', 'Admin'), createOrder);
router.post('/verify', authorize('Student', 'Admin'), verifyPayment);

// Admin Routes
router.get('/', authorize('Admin'), getAllPayments);
router.get('/sample-receipt', authorize('Admin'), downloadSampleReceipt);
router.get('/:id/receipt', authorize('Admin'), downloadReceipt);
router.post('/:id/resend-receipt', authorize('Admin'), resendReceipt);

module.exports = router;
