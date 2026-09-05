const express = require('express');
const { getServerDetails } = require('../controllers/developer.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/server-details', protect, authorize('Admin'), getServerDetails);

module.exports = router;
