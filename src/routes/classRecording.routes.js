const express = require('express');
const {
  getRecordings,
  getRecording,
  updateRecording,
  deleteRecording,
  streamRecording,
  downloadRecording,
  livekitWebhook,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  getRecordingStatus
} = require('../controllers/classRecording.controller');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Webhook is public (validated by SDK)
router.post('/webhook', express.raw({ type: 'application/webhook+json' }), livekitWebhook);

// Protected routes
router.use(protect);

// Recording control endpoints (Teacher/Admin)
router.post('/start', authorize('Admin', 'Faculty'), (req, res, next) => {
  console.log('[Recording][Route] START endpoint reached');
  next();
}, startRecording);
router.post('/pause', authorize('Admin', 'Faculty'), pauseRecording);
router.post('/resume', authorize('Admin', 'Faculty'), resumeRecording);
router.post('/stop', authorize('Admin', 'Faculty'), stopRecording);
router.get('/status/:roomName', authorize('Admin', 'Faculty'), getRecordingStatus);

// Stream and download — Admin and Faculty (Faculty auth is enforced in controller)
router.get('/:id/stream', authorize('Admin', 'Faculty'), streamRecording);
router.get('/:id/download', authorize('Admin', 'Faculty'), downloadRecording);

// Rest are Admin only
router.use(authorize('Admin'));

router.route('/')
  .get(getRecordings);

router.route('/:id')
  .get(getRecording)
  .put(updateRecording)
  .delete(deleteRecording);

module.exports = router;
