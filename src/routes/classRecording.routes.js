const express = require('express');
const {
  getRecordings,
  getRecording,
  updateRecording,
  deleteRecording,
  streamRecording,
  downloadRecording,
  livekitWebhook
} = require('../controllers/classRecording.controller');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Webhook is public (validated by SDK)
// Since Express json parser might interfere with raw body for webhook signature,
// we parse raw body for this specific route if possible, or just let the controller handle it.
router.post('/webhook', express.raw({ type: 'application/webhook+json' }), livekitWebhook);

// Protected routes (Admin access only as per requirements)
router.use(protect);
router.use(authorize('Admin'));

router.route('/')
  .get(getRecordings);

router.route('/:id')
  .get(getRecording)
  .put(updateRecording)
  .delete(deleteRecording);

router.get('/:id/stream', streamRecording);
router.get('/:id/download', downloadRecording);

module.exports = router;
