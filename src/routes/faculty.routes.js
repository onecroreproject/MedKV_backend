const express = require('express');
const { getFaculty } = require('../controllers/faculty.controller');
const router = express.Router();

// Will add auth middleware later: protect, authorize('admin')
router.route('/').get(getFaculty);

module.exports = router;
