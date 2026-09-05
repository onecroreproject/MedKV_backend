const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Recording = require('../models/Recording.model');
const LiveClass = require('../models/LiveClass.model');

// Ensure upload dir exists
const uploadDir = path.join(__dirname, '../../uploads/recordings');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config for generic uploads (chunks or old method)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `temp-${Date.now()}-${Math.round(Math.random() * 1E9)}.webm`);
  }
});
const upload = multer({ storage });

// --- LEGACY ENDPOINT (Fallback) ---
router.post('/upload-recording', upload.single('recording'), async (req, res) => {
  try {
    const { roomId, teacherId, courseId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No recording file provided' });
    }
    
    // Rename to proper name
    const finalName = `class-${roomId}-${Date.now()}.webm`;
    fs.renameSync(file.path, path.join(uploadDir, finalName));

    // Save metadata
    const recording = await Recording.create({
      title: `Live Class Recording - ${new Date().toLocaleDateString()}`,
      liveClass: roomId,
      faculty: teacherId,
      course: courseId,
      videoUrl: `/uploads/recordings/${finalName}`,
      compressionStatus: 'none',
      isPublished: false
    });

    await LiveClass.updateOne({ _id: roomId }, { isRecording: false });
    res.status(200).json({ success: true, recording });
  } catch (error) {
    console.error('Error saving recording:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- NEW CHUNKED RECORDING SYSTEM ---

// In-memory state for tracking recording sessions
const recordingSessions = {};

router.post('/recording/start', (req, res) => {
  const { recordingSessionId, roomId, teacherId, courseId } = req.body;
  if (!recordingSessionId || !roomId) return res.status(400).json({ error: 'Missing params' });
  
  const filepath = path.join(uploadDir, `class-${roomId}-${recordingSessionId}.webm`);
  
  recordingSessions[recordingSessionId] = {
    expectedChunkIndex: 0,
    receivedChunks: 0,
    filepath,
    roomId,
    teacherId,
    courseId: courseId || null,
    status: 'recording'
  };
  
  res.status(200).json({ success: true, message: 'Recording started' });
});

router.post('/recording/chunk', upload.single('chunk'), async (req, res) => {
  const { recordingSessionId, chunkIndex } = req.body;
  const chunkFile = req.file;
  
  const session = recordingSessions[recordingSessionId];
  if (!session || !chunkFile) {
    if (chunkFile) fs.unlinkSync(chunkFile.path); // cleanup
    return res.status(400).json({ error: 'Invalid session or missing chunk' });
  }

  // Very strict ordering check to prevent file corruption
  const idx = parseInt(chunkIndex, 10);
  if (idx !== session.expectedChunkIndex) {
    fs.unlinkSync(chunkFile.path); // reject out of order chunks
    return res.status(400).json({ error: `Out of order chunk. Expected ${session.expectedChunkIndex}, got ${idx}` });
  }
  
  try {
    const chunkData = fs.readFileSync(chunkFile.path);
    fs.appendFileSync(session.filepath, chunkData);
    fs.unlinkSync(chunkFile.path); // remove temp chunk

    session.receivedChunks++;
    session.expectedChunkIndex++;
    
    res.status(200).json({ success: true, receivedChunks: session.receivedChunks });
  } catch (err) {
    console.error('Error appending chunk:', err);
    res.status(500).json({ error: 'Failed to append chunk' });
  }
});

router.post('/recording/finalize', async (req, res) => {
  const { recordingSessionId } = req.body;
  const session = recordingSessions[recordingSessionId];
  
  if (!session) return res.status(400).json({ error: 'Invalid session' });
  
  try {
    session.status = 'finalized';
    
    // Save metadata
    const recording = await Recording.create({
      title: `Live Class Recording - ${new Date().toLocaleDateString()}`,
      liveClass: session.roomId,
      faculty: session.teacherId,
      course: session.courseId,
      videoUrl: `/uploads/recordings/class-${session.roomId}-${recordingSessionId}.webm`,
      compressionStatus: 'none',
      isPublished: false
    });

    await LiveClass.updateOne({ _id: session.roomId }, { isRecording: false });

    delete recordingSessions[recordingSessionId];
    
    res.status(200).json({ success: true, recording });
  } catch (error) {
    console.error('Error finalizing recording:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
