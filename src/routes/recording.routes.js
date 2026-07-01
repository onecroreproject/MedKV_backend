const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
  getRecordings,
  getRecording,
  createRecording,
  updateRecording,
  deleteRecording,
  uploadVideoRecording
} = require('../controllers/recording.controller');

const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Multer Config
const tempUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'temp');
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempUploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage: storage });

router.route('/upload')
  .post(protect, authorize('Admin', 'Faculty'), upload.single('video'), uploadVideoRecording);

router.route('/')
  .get(getRecordings)
  .post(protect, authorize('Admin', 'Faculty'), createRecording);

router.route('/:id')
  .get(getRecording)
  .put(protect, authorize('Admin', 'Faculty'), updateRecording)
  .delete(protect, authorize('Admin'), deleteRecording);



module.exports = router;
