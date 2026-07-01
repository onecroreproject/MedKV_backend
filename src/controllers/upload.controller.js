const { compressVideo } = require('../utils/videoCompressor');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    // Construct the public URL path for the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      url: fileUrl,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

    // Trigger background compression if it's a video file
    if (req.file.mimetype.startsWith('video/')) {
      // no recordingId passed because it's just a raw upload, not a Lesson Recording
      compressVideo(req.file.path, null, req.file.filename);
    }
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ success: false, message: 'File upload failed' });
  }
};
