const express = require('express');
const { globalSearch } = require('../controllers/search.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.get('/', globalSearch);

module.exports = router;
