const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const upload = require('../middleware/upload'); // Uses the existing multer upload middleware

// POST /api/v1/upload
router.post('/', upload.single('file'), uploadController.uploadFile);

module.exports = router;
