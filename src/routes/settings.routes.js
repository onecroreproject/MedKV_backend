const express = require('express');
const { getSettings, updateSettings } = require('../controllers/settings.controller');

const router = express.Router();

// Public route to get platform settings (needed for frontend UI)
router.get('/', getSettings);

// Admin-only route to update platform settings
router.put('/', updateSettings);

module.exports = router;
