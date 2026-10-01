const express = require('express');
const { authorize, callback, getSdkCredentials } = require('../controllers/zoom.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/oauth/authorize', authorize);
router.get('/oauth/callback', callback);
router.get('/sdk-credentials/:liveClassId', protect, getSdkCredentials);

module.exports = router;
