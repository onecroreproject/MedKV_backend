const express = require('express');
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/category.controller');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router
  .route('/')
  .get(getCategories)
  .post(protect, authorize('Admin'), createCategory);

router
  .route('/:id')
  .get(getCategory)
  .put(protect, authorize('Admin'), updateCategory)
  .delete(protect, authorize('Admin'), deleteCategory);

module.exports = router;
