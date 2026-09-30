const fs = require('fs');
const path = require('path');
const ClassRecording = require('../models/ClassRecording.model');
const LiveClass = require('../models/LiveClass.model');
const { EgressClient, EncodedFileOutput, EncodedFileType } = require('livekit-server-sdk');
const { mergeSegments } = require('../utils/ffmpegMerge');

const EGRESS_DIR = '/opt/livekit/egress/recordings/';

const egressClient = new EgressClient(
  process.env.LIVEKIT_URL || 'https://livekit.drsamreefathradiologyacademy.com', // Should ideally use HTTP/WS internal URL if possible, or public
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

const normalizeEgressStatus = (status) => {
  const statusMap = {
    0: 'EGRESS_STARTING',
    1: 'EGRESS_ACTIVE',
    2: 'EGRESS_ENDING',
    3: 'EGRESS_COMPLETE',
    4: 'EGRESS_FAILED',
    5: 'EGRESS_ABORTED',
    6: 'EGRESS_LIMIT_REACHED',
  };

  if (typeof status === 'number') {
    return statusMap[status] || `EGRESS_UNKNOWN_${status}`;
  }

  if (typeof status === 'string' && /^\d+$/.test(status)) {
    return statusMap[Number(status)] || `EGRESS_UNKNOWN_${status}`;
  }

  return status;
};

// Helper to trigger merge
const triggerMergeIfReady = async (recordingId) => {
  try {
    const recording = await ClassRecording.findById(recordingId);
    if (!recording || recording.recordingState !== 'processing') return;

    // Check if all segments are complete
    const allComplete = recording.segments.every(s => 
      s.status === 'EGRESS_COMPLETE' || s.status === 'EGRESS_FAILED' || s.status === 'EGRESS_ABORTED' || s.status === 'EGRESS_LIMIT_REACHED'
    );

    if (allComplete) {
      const successfulSegments = recording.segments.filter(s => s.status === 'EGRESS_COMPLETE' && s.filePath && fs.existsSync(s.filePath));
      
      if (successfulSegments.length === 0) {
        recording.recordingState = 'failed';
        recording.errorMessage = 'All segments failed or files missing';
        await recording.save();
        return;
      }

      const pathsToMerge = successfulSegments.map(s => s.filePath);
      const safeCourseName = (recording.title || 'recording').replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      const finalFileName = `${safeCourseName}_Merged_${timestamp}_${Date.now()}.mp4`;
      const finalOutputPath = path.join(EGRESS_DIR, finalFileName);

      try {
        await mergeSegments(pathsToMerge, finalOutputPath);
        
        let totalDuration = 0;
        let totalSize = 0;
        successfulSegments.forEach(s => {
          totalDuration += (s.duration || 0);
          totalSize += (s.fileSize || 0);
        });

        // If file was merged successfully, we can get actual size from disk
        if (fs.existsSync(finalOutputPath)) {
          const stat = fs.statSync(finalOutputPath);
          totalSize = stat.size;
        }

        recording.recordingState = 'completed';
        recording.fileName = finalFileName;
        recording.filePath = finalOutputPath;
        recording.duration = totalDuration;
        recording.fileSize = totalSize;
        recording.endedAt = new Date();
        await recording.save();

        // Optional: Cleanup individual segment files
        for (const segPath of pathsToMerge) {
          try { if (fs.existsSync(segPath)) fs.unlinkSync(segPath); } catch(e) {}
        }
      } catch (mergeError) {
        console.error('Merge failed:', mergeError);
        recording.recordingState = 'failed';
        recording.errorMessage = 'Merge failed: ' + mergeError.message;
        await recording.save();
      }
    }
  } catch(error) {
    console.error('triggerMergeIfReady error', error);
  }
};

// @desc    Start Recording
// @route   POST /api/v1/class-recordings/start
// @access  Private (Teacher/Admin)
exports.startRecording = async (req, res) => {
  console.log('========================================');
  console.log('START RECORDING API CALLED');
  console.log('Body:', req.body);
  console.log('User:', req.user);
  console.log('========================================');

  try {
    const { roomName } = req.body;
    if (!roomName) return res.status(400).json({ success: false, message: 'roomName is required' });

    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'LiveClass not found' });
    }

    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }

    if (liveClass.roomStatus !== 'active') {
      return res.status(400).json({ success: false, message: 'CLASS_NOT_ACTIVE' });
    }

    let recording = await ClassRecording.findOne({ roomName, recordingState: { $in: ['idle', 'recording', 'paused', 'processing'] } });
    
    if (recording && recording.recordingState !== 'idle') {
      return res.status(400).json({ success: false, message: 'RECORDING_ALREADY_ACTIVE' });
    }

    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: `/out/recordings/class_${roomName}_{time}.mp4`
    });

    const info = await egressClient.startRoomCompositeEgress(
      roomName,
      {
        file: fileOutput
      },
      {
        layout: 'grid',
        videoOnly: false,
        audioOnly: false
      }
    );

    let courseId = null;
    let teacherId = null;
    let title = `Recording for ${roomName}`;
    
    if (liveClass) {
      courseId = liveClass.course;
      teacherId = liveClass.faculty;
      title = liveClass.title || title;
    }

    if (!recording) {
      recording = new ClassRecording({
        roomName,
        course: courseId,
        teacher: teacherId,
        title,
        startedAt: new Date(),
        egressId: info.egressId
      });
    } else if (!recording.egressId) {
      recording.egressId = info.egressId;
    }

    recording.recordingState = 'recording';
    recording.activeEgressId = info.egressId;
    recording.segments.push({
      egressId: info.egressId,
      status: 'EGRESS_STARTING',
      startedAt: new Date()
    });

    await recording.save();

    const io = req.app.get('io');
    if (io) {
      io.to(roomName).emit('class:recording-started', {
        roomId: roomName,
        recordingId: recording._id,
        status: recording.recordingState,
        startedAt: recording.startedAt
      });
    }

    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('startRecording error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Pause Recording
// @route   POST /api/v1/class-recordings/pause
// @access  Private (Teacher/Admin)
exports.pauseRecording = async (req, res) => {
  try {
    const { roomName } = req.body;

    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) return res.status(404).json({ success: false, message: 'LiveClass not found' });
    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }

    const recording = await ClassRecording.findOne({ roomName, recordingState: 'recording' });
    
    if (!recording) return res.status(400).json({ success: false, message: 'No active recording found to pause.' });

    if (recording.activeEgressId) {
      await egressClient.stopEgress(recording.activeEgressId).catch(err => console.error('Egress stop error', err));
      recording.activeEgressId = null;
    }

    recording.recordingState = 'paused';
    await recording.save();

    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('pauseRecording error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Resume Recording
// @route   POST /api/v1/class-recordings/resume
// @access  Private (Teacher/Admin)
exports.resumeRecording = async (req, res) => {
  try {
    const { roomName } = req.body;

    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) return res.status(404).json({ success: false, message: 'LiveClass not found' });
    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }

    const recording = await ClassRecording.findOne({ roomName, recordingState: 'paused' });
    
    if (!recording) return res.status(400).json({ success: false, message: 'No paused recording found to resume.' });

    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: `/out/recordings/class_${roomName}_resumed_{time}.mp4`
    });

    const info = await egressClient.startRoomCompositeEgress(roomName, {
      file: fileOutput
    }, {
      layout: 'grid',
      customBaseUrl: 'https://recording.drsamreefathradiologyacademy.com',
      videoOnly: false,
      audioOnly: false
    });

    recording.recordingState = 'recording';
    recording.activeEgressId = info.egressId;
    recording.segments.push({
      egressId: info.egressId,
      status: 'EGRESS_STARTING',
      startedAt: new Date()
    });

    await recording.save();
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('resumeRecording error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Stop Recording (Finalize)
// @route   POST /api/v1/class-recordings/stop
// @access  Private (Teacher/Admin)
exports.stopRecording = async (req, res) => {
  try {
    const { roomName } = req.body;

    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) return res.status(404).json({ success: false, message: 'LiveClass not found' });
    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }

    const recording = await ClassRecording.findOne({ roomName, recordingState: { $in: ['recording', 'paused'] } });
    
    if (!recording) return res.status(400).json({ success: false, message: 'RECORDING_NOT_FOUND' });

    if (recording.activeEgressId && recording.recordingState === 'recording') {
      await egressClient.stopEgress(recording.activeEgressId).catch(err => console.error('Egress stop error', err));
      recording.activeEgressId = null;
    }

    recording.recordingState = 'processing';
    await recording.save();

    // Trigger merge just in case all segments already fired webhook
    await triggerMergeIfReady(recording._id);

    const io = req.app.get('io');
    if (io) {
      io.to(roomName).emit('class:recording-stopping', {
        roomId: roomName,
        recordingId: recording._id,
        status: 'stopping'
      });
    }

    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('stopRecording error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Recording Status
// @route   GET /api/v1/class-recordings/status/:roomName
// @access  Private (Teacher/Admin)
exports.getRecordingStatus = async (req, res) => {
  try {
    const { roomName } = req.params;
    const recording = await ClassRecording.findOne({ roomName }).sort({ createdAt: -1 });
    if (!recording) return res.status(200).json({ success: true, data: { recordingState: 'idle' } });
    
    // Active Fallback Check if webhooks are failing/delayed
    let updated = false;
    if (recording.recordingState === 'processing' || recording.recordingState === 'recording' || recording.recordingState === 'paused') {
      try {
        const activeEgresses = await egressClient.listEgress({ roomName });
        for (const egressInfo of activeEgresses) {
          const seg = recording.segments.find(s => s.egressId === egressInfo.egressId);
          if (seg) {
            const normalizedStatus = normalizeEgressStatus(egressInfo.status);
            if (seg.status !== normalizedStatus) {
              seg.status = normalizedStatus;
              updated = true;
              if (normalizedStatus === 'EGRESS_COMPLETE' && egressInfo.fileResults && egressInfo.fileResults.length > 0) {
                const fileResult = egressInfo.fileResults[0];
                // LiveKit returns the container path (e.g. /out/recordings/filename.mp4), so extract basename
                const actualFileName = path.basename(fileResult.filename);
                seg.fileName = actualFileName;
                seg.filePath = path.join(EGRESS_DIR, actualFileName);
                seg.duration = fileResult.duration ? Math.floor(Number(fileResult.duration) / 1000000000) : 0;
                seg.fileSize = Number(fileResult.size);
                seg.endedAt = new Date();
              }
            }
          }
        }
        if (updated) {
          await recording.save();
          if (recording.recordingState === 'processing') {
            await triggerMergeIfReady(recording._id);
          }
        }
      } catch (err) {
        console.error('Fallback egress check error:', err);
      }
    }

    // Recalculate duration
    let accumulatedDuration = 0;
    recording.segments.forEach(s => {
      if (s.duration) {
        accumulatedDuration += s.duration;
      } else if (s.startedAt && (recording.recordingState === 'recording' || s.status === 'EGRESS_ACTIVE' || s.status === 'EGRESS_STARTING')) {
        accumulatedDuration += Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000);
      }
    });

    res.status(200).json({ success: true, data: { 
      recordingState: recording.recordingState,
      accumulatedDuration,
      startedAt: recording.startedAt
    }});
  } catch (error) {
    console.error('getRecordingStatus error:', error);
    res.status(500).json({ success: false, message: error.message });
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
    
    let event;
    try {
       let bodyString = req.body;
       if (Buffer.isBuffer(req.body)) {
         bodyString = req.body.toString('utf8');
       } else if (req.rawBody) {
         bodyString = req.rawBody;
       } else if (typeof req.body === 'object') {
         bodyString = JSON.stringify(req.body);
       }
       event = await receiver.receive(bodyString, req.get('Authorization'));
    } catch (e) {
       console.warn('Webhook signature validation failed or missing. Attempting direct parse.', e.message);
       try {
         event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(req.body.toString('utf8') || '{}');
       } catch(err) {
         event = null;
       }
    }
    
    if (!event) return res.status(400).send('No event');

    if (event.event === 'egress_started') {
      const egressInfo = event.egressInfo;
      if (!egressInfo) return res.status(200).send();
      
      const egressId = egressInfo.egressId;
      const recording = await ClassRecording.findOne({ 'segments.egressId': egressId });
      
      if (recording) {
        const seg = recording.segments.find(s => s.egressId === egressId);
        if (seg) {
          seg.status = normalizeEgressStatus(egressInfo.status || 'EGRESS_ACTIVE');
          await recording.save();
        }
      }
    } else if (event.event === 'egress_ended') {
      const egressInfo = event.egressInfo;
      if (!egressInfo) return res.status(200).send();
      
      const egressId = egressInfo.egressId;
      const fileResults = egressInfo.fileResults;
      let filePath = '';
      let fileName = '';
      let duration = 0;
      let fileSize = 0;
      
      if (fileResults && fileResults.length > 0) {
        const fileResult = fileResults[0];

        const actualFileName = path.basename(fileResult.filename);

        fileName = actualFileName;
        filePath = path.join(EGRESS_DIR, actualFileName);

        duration = fileResult.duration != null
          ? Math.floor(Number(fileResult.duration) / 1000000000)
          : 0;

        fileSize = fileResult.size != null
          ? Number(fileResult.size)
          : 0;
      }
      
      const recording = await ClassRecording.findOne({ 'segments.egressId': egressId });
      if (recording) {
        const seg = recording.segments.find(s => s.egressId === egressId);
        if (seg) {
          const normalizedStatus = normalizeEgressStatus(egressInfo.status || 'EGRESS_COMPLETE');
          seg.status = normalizedStatus;
          seg.endedAt = new Date();
          seg.fileName = fileName;
          seg.filePath = filePath;
          seg.duration = duration;
          seg.fileSize = fileSize;
          await recording.save();

          const io = req.app.get('io');
          if (io) {
            io.to(recording.roomName).emit(
              normalizedStatus === 'EGRESS_COMPLETE' ? 'class:recording-completed' : 'class:recording-failed',
              {
                roomId: recording.roomName,
                recordingId: recording._id,
                status: normalizedStatus === 'EGRESS_COMPLETE' ? 'completed' : 'failed',
                endedAt: seg.endedAt
              }
            );
          }
        }
        
        // Check if we need to merge
        if (recording.recordingState === 'processing') {
          await triggerMergeIfReady(recording._id);
        }
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing egress webhook:', error);
    res.status(500).send('Server Error');
  }
};

// ... keep existing getRecordings, getRecording, updateRecording, deleteRecording, streamRecording, downloadRecording
exports.getRecordings = async (req, res) => {
  try {
    const { search, course, status, page = 1, limit = 20 } = req.query;
    let query = {};
    if (search) query.title = { $regex: search, $options: 'i' };
    if (course) query.course = course;
    if (status) query.recordingState = status;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await ClassRecording.countDocuments(query);

    let recordings = await ClassRecording.find(query)
      .populate('course', 'title')
      .populate('teacher', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Active Fallback for processing recordings when viewing the list
    for (const rec of recordings) {
      if (rec.recordingState === 'processing') {
        let updated = false;
        try {
          const activeEgresses = await egressClient.listEgress({ roomName: rec.roomName });
          for (const egressInfo of activeEgresses) {
            const seg = rec.segments.find(s => s.egressId === egressInfo.egressId);
            if (seg) {
              const normalizedStatus = normalizeEgressStatus(egressInfo.status);
              if (seg.status !== normalizedStatus) {
                seg.status = normalizedStatus;
                updated = true;
                if (normalizedStatus === 'EGRESS_COMPLETE' && egressInfo.fileResults && egressInfo.fileResults.length > 0) {
                  const fileResult = egressInfo.fileResults[0];
                  const actualFileName = path.basename(fileResult.filename);
                  seg.fileName = actualFileName;
                  seg.filePath = path.join(EGRESS_DIR, actualFileName);
                  seg.duration = fileResult.duration ? Math.floor(Number(fileResult.duration) / 1000000000) : 0;
                  seg.fileSize = Number(fileResult.size);
                  seg.endedAt = new Date();
                }
              }
            }
          }
          if (updated) {
            await rec.save();
            await triggerMergeIfReady(rec._id);
          }
        } catch(e) {}
      }
    }
    
    // Refetch in case anything merged (apply same pagination)
    recordings = await ClassRecording.find(query)
      .populate('course', 'title')
      .populate('teacher', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: recordings.length,
      data: recordings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching class recordings:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id)
      .populate('course', 'title')
      .populate('teacher', 'name email');
    if (!recording) return res.status(404).json({ success: false, message: 'Recording not found' });
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateRecording = async (req, res) => {
  try {
    const { title, description, course } = req.body;
    const recording = await ClassRecording.findByIdAndUpdate(req.params.id, { title, description, course }, { new: true, runValidators: true });
    if (!recording) return res.status(404).json({ success: false, message: 'Recording not found' });
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('Error updating recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.deleteRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, message: 'Recording not found' });
    
    // delete merged file
    if (recording.filePath) {
      const fullPath = path.resolve(recording.filePath);
      if (fullPath.startsWith(path.resolve(EGRESS_DIR)) && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    // delete segments
    if (recording.segments) {
      recording.segments.forEach(s => {
        if (s.filePath) {
          const segPath = path.resolve(s.filePath);
          if (segPath.startsWith(path.resolve(EGRESS_DIR)) && fs.existsSync(segPath)) {
             try { fs.unlinkSync(segPath); } catch(e) {}
          }
        }
      });
    }
    
    await recording.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.streamRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id);
    if (!recording || !recording.filePath) return res.status(404).json({ success: false, message: 'Recording not found or not finalized' });
    
    const fullPath = path.resolve(recording.filePath);
    if (!fullPath.startsWith(path.resolve(EGRESS_DIR))) return res.status(403).json({ success: false, message: 'Invalid path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, message: 'Video file not found on disk' });
    
    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize) return res.status(416).send('Requested range not satisfiable');
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(fullPath, { start, end });
      const head = { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' };
      res.writeHead(200, head);
      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (error) {
    console.error('Error streaming recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.downloadRecording = async (req, res) => {
  try {
    const recording = await ClassRecording.findById(req.params.id);
    if (!recording || !recording.filePath) return res.status(404).json({ success: false, message: 'Recording not found or not finalized' });
    
    const fullPath = path.resolve(recording.filePath);
    if (!fullPath.startsWith(path.resolve(EGRESS_DIR))) return res.status(403).json({ success: false, message: 'Invalid path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, message: 'Video file not found on disk' });
    
    res.download(fullPath, recording.fileName || 'recording.mp4');
  } catch (error) {
    console.error('Error downloading recording:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
