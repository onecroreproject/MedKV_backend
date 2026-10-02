const express = require('express');
const { authorize: zoomAuthorize, callback, getSdkCredentials, webhook, startMeetingRedirect, joinMeetingRedirect } = require('../controllers/zoom.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/oauth/authorize', protect, authorize('Admin'), zoomAuthorize);
router.get('/oauth/callback', callback);
router.get('/sdk-credentials/:liveClassId', protect, getSdkCredentials);
router.post('/webhook', webhook);
router.post('/end-meeting/:liveClassId', protect, authorize('Admin', 'Faculty'), require('../controllers/zoom.controller').endMeeting);
router.get('/start/:liveClassId', protect, authorize('Admin'), startMeetingRedirect);
router.get('/join/:liveClassId', protect, joinMeetingRedirect);

module.exports = router;
