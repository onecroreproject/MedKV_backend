const express = require('express');
const { authorize: zoomAuthorize, callback, getSdkCredentials, webhook } = require('../controllers/zoom.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/oauth/authorize', protect, authorize('Admin'), zoomAuthorize);
router.get('/oauth/callback', callback);
router.get('/sdk-credentials/:liveClassId', protect, getSdkCredentials);
router.post('/webhook', webhook);

module.exports = router;
