const express = require('express');
const {
  submitEnquiry,
  getEnquiries,
  updateEnquiryStatus,
  replyEnquiry
} = require('../controllers/enquiry.controller');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router
  .route('/')
  .post(submitEnquiry)
  .get(protect, authorize('Admin'), getEnquiries);

router
  .route('/:id/reply')
  .post(protect, authorize('Admin'), replyEnquiry);

router
  .route('/:id/status')
  .put(protect, authorize('Admin'), updateEnquiryStatus);

module.exports = router;
