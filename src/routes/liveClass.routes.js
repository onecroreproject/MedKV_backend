const express = require('express');
const {
  getLiveClasses,
  getLiveClass,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass
} = require('../controllers/liveClass.controller');

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

module.exports = router;
