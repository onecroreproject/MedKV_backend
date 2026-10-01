const express = require('express');
const { authorize, callback } = require('../controllers/zoom.controller');

const router = express.Router();

router.get('/oauth/authorize', authorize);
router.get('/oauth/callback', callback);

module.exports = router;
