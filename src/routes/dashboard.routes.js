const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
// Use auth middleware here if applicable, for now keeping it open or assuming global protection
// const { protect, authorize } = require('../middleware/auth');

// GET /api/v1/dashboard/stats
router.get('/stats', dashboardController.getDashboardStats);

module.exports = router;
