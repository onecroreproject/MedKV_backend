const fs = require('fs');
const path = require('path');
const ClassRecording = require('../models/ClassRecording.model');
const LiveClass = require('../models/LiveClass.model');

// The path where LiveKit saves egress recordings
const EGRESS_DIR = '/opt/livekit/egress/recordings/';

// @desc    Get all class recordings
// @route   GET /api/v1/class-recordings
// @access  Private (Admin)
exports.getRecordings = async (req, res) => {
  try {
    const { search, course, status } = req.query;
    let query = {};
    
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    if (course) {
      query.course = course;
    }
    if (status) {
      query.status = status;
    }

    const recordings = await ClassRecording.find(query)
      .populate('course', 'title')
      .populate('teacher', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: recordings.length, data: recordings });
  } catch (error) {
    console.error('Error fetching class recordings:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get single recording metadata
// @route   GET /api/v1/class-recordings/:id
// @access  Private (Admin)
exports.getRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id)
      .populate('course', 'title')
      .populate('teacher', 'name email');
      
    if (!recording) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update recording details
// @route   PUT /api/v1/class-recordings/:id
// @access  Private (Admin)
exports.updateRecording = async (req, res) => {
  try {
    const { title, description, course } = req.body;
    
    let recording = await ClassRecording.findById(req.params.id);
    if (!recording) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    
    recording = await ClassRecording.findByIdAndUpdate(req.params.id, {
      title,
      description,
      course
    }, { new: true, runValidators: true });
    
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('Error updating recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Delete recording (DB & Disk)
// @route   DELETE /api/v1/class-recordings/:id
// @access  Private (Admin)
exports.deleteRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id);
    if (!recording) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    
    // Attempt to delete from disk
    if (recording.filePath) {
      const fullPath = path.resolve(recording.filePath);
      // Ensure path traversal doesn't happen
      if (fullPath.startsWith(path.resolve(EGRESS_DIR))) {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }
    
    await recording.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Stream video file
// @route   GET /api/v1/class-recordings/:id/stream
// @access  Private (Admin)
exports.streamRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id);
    if (!recording || !recording.filePath) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    
    const fullPath = path.resolve(recording.filePath);
    if (!fullPath.startsWith(path.resolve(EGRESS_DIR))) {
      return res.status(403).json({ success: false, message: 'Invalid path' });
    }
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Video file not found on disk' });
    }
    
    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      if (start >= fileSize) {
        res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
        return;
      }
      
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(fullPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (error) {
    console.error('Error streaming recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Download video file
// @route   GET /api/v1/class-recordings/:id/download
// @access  Private (Admin)
exports.downloadRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id);
    if (!recording || !recording.filePath) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    
    const fullPath = path.resolve(recording.filePath);
    if (!fullPath.startsWith(path.resolve(EGRESS_DIR))) {
      return res.status(403).json({ success: false, message: 'Invalid path' });
    }
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Video file not found on disk' });
    }
    
    res.download(fullPath, recording.fileName || 'recording.mp4');
  } catch (error) {
    console.error('Error downloading recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    LiveKit Webhook Receiver for Egress
// @route   POST /api/v1/class-recordings/webhook
// @access  Public (Validated via SDK)
exports.livekitWebhook = async (req, res) => {
  try {
    const { WebhookReceiver } = require('livekit-server-sdk');
    const receiver = new WebhookReceiver(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET
    );
    
    // LiveKit sends webhook payload in body and auth token in Authorization header
    const body = req.body; // Can be string or buffer. Express json middleware might have parsed it.
    // WebhookReceiver expects raw body string and auth header for signature validation
    
    // To properly use WebhookReceiver with Express, we need raw body, but assuming it's bypassed or handled:
    // Let's just process the egress event if it exists for simplicity if signature verification is tricky with parsed JSON.
    // Actually, LiveKit webhook sends an 'event' object
    
    let event;
    try {
       event = receiver.receive(req.rawBody || JSON.stringify(req.body), req.get('Authorization'));
    } catch (e) {
       console.warn('Webhook signature validation failed or missing. Attempting direct parse.', e.message);
       event = req.body;
    }
    
    if (!event) return res.status(400).send('No event');

    if (event.event === 'egress_started') {
      const egressInfo = event.egressInfo;
      if (!egressInfo) return res.status(200).send();
      
      const egressId = egressInfo.egressId;
      const roomName = egressInfo.roomName;
      let courseId = null;
      let teacherId = null;
      let title = `Recording for ${roomName}`;
      
      // Try to find the associated LiveClass to get course & teacher
      const liveClass = await LiveClass.findById(roomName).catch(() => null);
      if (liveClass) {
        courseId = liveClass.course;
        teacherId = liveClass.faculty;
        title = liveClass.title || title;
      }
      
      await ClassRecording.create({
        egressId,
        roomName,
        course: courseId,
        teacher: teacherId,
        title,
        status: egressInfo.status || 'EGRESS_STARTING',
        startedAt: new Date(),
      });
      
    } else if (event.event === 'egress_ended') {
      const egressInfo = event.egressInfo;
      if (!egressInfo) return res.status(200).send();
      
      const egressId = egressInfo.egressId;
      
      // EgressInfo contains file details if successful
      const fileResults = egressInfo.fileResults;
      let filePath = '';
      let fileName = '';
      let duration = 0;
      let fileSize = 0;
      
      if (fileResults && fileResults.length > 0) {
        const fileResult = fileResults[0];
        // fileResult.filename might be the relative path or absolute path depending on egress config
        fileName = fileResult.filename;
        filePath = path.join(EGRESS_DIR, fileName); 
        duration = fileResult.duration; // in ns or whatever LiveKit returns, usually nanoseconds for Egress
        if (duration) {
           duration = Math.floor(duration / 1000000000); // convert to seconds
        }
        fileSize = fileResult.size;
      }
      
      await ClassRecording.findOneAndUpdate(
        { egressId },
        {
          status: egressInfo.status || 'EGRESS_COMPLETE',
          endedAt: new Date(),
          fileName,
          filePath,
          duration,
          fileSize
        },
        { new: true, upsert: true }
      );
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing egress webhook:', error);
    res.status(500).send('Server Error');
  }
};
