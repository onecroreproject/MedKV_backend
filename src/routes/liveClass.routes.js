const express = require('express');
const {
  getLiveClasses,
  getLiveClass,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass
} = require('../controllers/liveClass.controller');
const { 
  createLiveKitToken,
  forceMuteParticipant,
  kickParticipant,
  forceCameraOffParticipant,
  muteAll,
  cameraOffAll
} = require('../controllers/livekitController');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Allow public to see live classes or require login (using protect if needed)
router.route('/')
  .get(getLiveClasses)
  .post(protect, authorize('Admin', 'Faculty'), createLiveClass);

router.route('/:id')
  .get(getLiveClass)
  .put(protect, authorize('Admin', 'Faculty'), updateLiveClass)
  .delete(protect, authorize('Admin'), deleteLiveClass);

// LiveKit Token Route
router.route('/token/livekit')
  .post(protect, createLiveKitToken);

// Host Controls
router.route('/mute-participant')
  .post(protect, authorize('Admin', 'Faculty', 'teacher'), forceMuteParticipant);

router.route('/camera-off-participant')
  .post(protect, authorize('Admin', 'Faculty', 'teacher'), forceCameraOffParticipant);

router.route('/kick-participant')
  .post(protect, authorize('Admin', 'Faculty', 'teacher'), kickParticipant);

router.route('/mute-all')
  .post(protect, authorize('Admin', 'Faculty', 'teacher'), muteAll);

router.route('/camera-off-all')
  .post(protect, authorize('Admin', 'Faculty', 'teacher'), cameraOffAll);

module.exports = router;
