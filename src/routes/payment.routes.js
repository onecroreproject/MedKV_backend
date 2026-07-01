const express = require('express');
const { createOrder, verifyPayment, getAllPayments, downloadReceipt, resendReceipt, downloadSampleReceipt } = require('../controllers/payment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect); // Ensure all payment routes require authentication

// Student Routes
router.post('/create-order', authorize('Student', 'Admin'), createOrder);
router.post('/verify', authorize('Student', 'Admin'), verifyPayment);

// Admin Routes
router.get('/', authorize('Admin'), getAllPayments);
router.get('/sample-receipt', authorize('Admin'), downloadSampleReceipt);
router.get('/:id/receipt', authorize('Admin'), downloadReceipt);
router.post('/:id/resend-receipt', authorize('Admin'), resendReceipt);

module.exports = router;
