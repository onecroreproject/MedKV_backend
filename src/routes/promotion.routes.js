const express = require('express');
const {
  getPromotionStats,
  sendTestPromotion,
  triggerPromotions
} = require('../controllers/promotion.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// All promotion management routes require Admin authorization
router.use(protect);
router.use(authorize('Admin'));

router.get('/stats', getPromotionStats);
router.post('/send-test', sendTestPromotion);
router.post('/trigger', triggerPromotions);

module.exports = router;
