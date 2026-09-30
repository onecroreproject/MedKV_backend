import re

def main():
    file_path = r'r:\ClientProject\MediacalKV\backend\src\controllers\classRecording.controller.js'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We will replace startRecording, pauseRecording, resumeRecording, stopRecording, triggerMergeIfReady, getRecordingStatus, livekitWebhook.
    
    start_rec_replacement = """exports.startRecording = async (req, res) => {
  const traceId = `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log('[Recording][Controller] ================================');
  console.log('[Recording][Controller] START RECORDING');
  console.log('[Recording][Controller] Time:', new Date().toISOString());
  console.log('[Recording][Controller] User ID:', req.user?._id);
  console.log('[Recording][Controller] User Role:', req.user?.role);
  console.log('[Recording][Controller] Room ID:', req.body?.roomName);

  try {
    const { roomName } = req.body;
    if (!roomName) return res.status(400).json({ success: false, message: 'roomName is required' });

    console.log('[Recording][Controller] Looking up LiveClass');
    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'LiveClass not found' });
    }
    
    console.log('[Recording][Controller] LiveClass found');
    console.log('[Recording][Controller] LiveClass ID:', liveClass._id);
    console.log('[Recording][Controller] LiveClass status:', liveClass.roomStatus);
    console.log('[Recording][Controller] Assigned Host ID:', liveClass.faculty);

    console.log('[Recording][Auth] Checking recording permission');
    console.log('[Recording][Auth] User ID:', req.user?._id);
    console.log('[Recording][Auth] Assigned Host ID:', liveClass.faculty);
    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
      console.error('[Recording][Auth] RECORDING ACCESS DENIED');
      console.error('[Recording][Auth] User ID:', req.user?._id);
      console.error('[Recording][Auth] Role:', req.user?.role);
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }
    console.log('[Recording][Auth] Authorized:', true);

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

    console.log('[Recording][Egress] ================================');
    console.log('[Recording][Egress] Preparing Egress request');
    console.log('[Recording][Egress] Room:', roomName);
    console.log('[Recording][Egress] Trace ID:', traceId);
    
    console.log('[Recording][Egress] Calling LiveKit Egress API');
    let info;
    try {
      info = await egressClient.startRoomCompositeEgress(
        roomName,
        { file: fileOutput },
        { layout: 'grid', videoOnly: false, audioOnly: false }
      );
      console.log('[Recording][Egress] API SUCCESS');
      console.log('[Recording][Egress] Egress ID:', info?.egressId);
      console.log('[Recording][Egress] Status:', info?.status);
      console.log('[Recording][Egress] Room:', info?.roomName);
    } catch(err) {
      console.error('[Recording][Egress] API FAILED');
      console.error('[Recording][Egress] Message:', err.message);
      console.error('[Recording][Egress] Response:', err.response?.data);
      throw err;
    }

    let courseId = null;
    let teacherId = null;
    let title = `Recording for ${roomName}`;
    
    if (liveClass) {
      courseId = liveClass.course;
      teacherId = liveClass.faculty;
      title = liveClass.title || title;
    }

    console.log('[Recording][Mongo] Creating ClassRecording');
    console.log('[Recording][Mongo] Room ID:', roomName);
    console.log('[Recording][Mongo] LiveClass ID:', liveClass._id);
    console.log('[Recording][Mongo] Trace ID:', traceId);

    try {
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
      console.log('[Recording][Mongo] ClassRecording CREATED');
      console.log('[Recording][Mongo] Recording ID:', recording._id);
      console.log('[Recording][Mongo] Egress ID:', recording.egressId);
      console.log('[Recording][Mongo] Status:', recording.recordingState);
    } catch(err) {
      console.error('[Recording][Mongo] CREATE FAILED');
      console.error('[Recording][Mongo] Error message:', err.message);
      console.error('[Recording][Mongo] Error code:', err.code);
      console.error('[Recording][Mongo] Key pattern:', err.keyPattern);
      throw err;
    }

    const io = req.app.get('io');
    if (io) {
      console.log('[Recording][Socket] Broadcasting recording-started');
      console.log('[Recording][Socket] Room:', roomName);
      console.log('[Recording][Socket] Recording ID:', recording._id);
      io.to(roomName).emit('class:recording-started', {
        roomId: roomName,
        recordingId: recording._id,
        status: recording.recordingState,
        startedAt: recording.startedAt
      });
    }

    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('[Recording][Error]', {
      operation: 'START',
      traceId,
      roomId: req.body?.roomName,
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    res.status(500).json({ success: false, message: error.message });
  }
};"""

    pause_rec_replacement = """exports.pauseRecording = async (req, res) => {
  const traceId = `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log('[Recording][Controller] ================================');
  console.log('[Recording][Controller] PAUSE RECORDING');
  console.log('[Recording][Controller] Time:', new Date().toISOString());
  console.log('[Recording][Controller] User ID:', req.user?._id);
  console.log('[Recording][Controller] User Role:', req.user?.role);
  console.log('[Recording][Controller] Room ID:', req.body?.roomName);

  try {
    const { roomName } = req.body;

    console.log('[Recording][Controller] Looking up LiveClass');
    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) return res.status(404).json({ success: false, message: 'LiveClass not found' });
    
    console.log('[Recording][Auth] Checking recording permission');
    console.log('[Recording][Auth] User ID:', req.user?._id);
    console.log('[Recording][Auth] Assigned Host ID:', liveClass.faculty);
    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
      console.error('[Recording][Auth] RECORDING ACCESS DENIED');
      console.error('[Recording][Auth] User ID:', req.user?._id);
      console.error('[Recording][Auth] Role:', req.user?.role);
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }
    console.log('[Recording][Auth] Authorized:', true);

    const recording = await ClassRecording.findOne({ roomName, recordingState: 'recording' });
    if (!recording) return res.status(400).json({ success: false, message: 'No active recording found to pause.' });

    console.log('[Recording][Pause] Request received');
    console.log('[Recording][Pause] Recording ID:', recording._id);
    console.log('[Recording][Pause] Current status:', recording.recordingState);
    console.log('[Recording][Pause] Egress ID:', recording.activeEgressId);

    if (recording.activeEgressId) {
      console.log('[Recording][Pause] LiveKit request started');
      try {
        await egressClient.stopEgress(recording.activeEgressId);
        console.log('[Recording][Pause] LiveKit response received');
      } catch (err) {
        console.error('[Recording][Pause] Egress stop error', err);
      }
      recording.activeEgressId = null;
    }

    recording.recordingState = 'paused';
    await recording.save();
    console.log('[Recording][Pause] Mongo updated');

    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('[Recording][Error]', {
      operation: 'PAUSE',
      traceId,
      roomId: req.body?.roomName,
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    res.status(500).json({ success: false, message: error.message });
  }
};"""

    resume_rec_replacement = """exports.resumeRecording = async (req, res) => {
  const traceId = `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log('[Recording][Controller] ================================');
  console.log('[Recording][Controller] RESUME RECORDING');
  console.log('[Recording][Controller] Time:', new Date().toISOString());
  console.log('[Recording][Controller] User ID:', req.user?._id);
  console.log('[Recording][Controller] User Role:', req.user?.role);
  console.log('[Recording][Controller] Room ID:', req.body?.roomName);

  try {
    const { roomName } = req.body;

    console.log('[Recording][Controller] Looking up LiveClass');
    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) return res.status(404).json({ success: false, message: 'LiveClass not found' });
    
    console.log('[Recording][Auth] Checking recording permission');
    console.log('[Recording][Auth] User ID:', req.user?._id);
    console.log('[Recording][Auth] Assigned Host ID:', liveClass.faculty);
    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
      console.error('[Recording][Auth] RECORDING ACCESS DENIED');
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }
    console.log('[Recording][Auth] Authorized:', true);

    const recording = await ClassRecording.findOne({ roomName, recordingState: 'paused' });
    if (!recording) return res.status(400).json({ success: false, message: 'No paused recording found to resume.' });

    console.log('[Recording][Resume] Request received');
    console.log('[Recording][Resume] Recording ID:', recording._id);

    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: `/out/recordings/class_${roomName}_resumed_{time}.mp4`
    });

    console.log('[Recording][Resume] LiveKit request started');
    let info;
    try {
      info = await egressClient.startRoomCompositeEgress(roomName, { file: fileOutput }, { layout: 'grid', customBaseUrl: 'https://recording.drsamreefathradiologyacademy.com', videoOnly: false, audioOnly: false });
      console.log('[Recording][Resume] LiveKit response received');
      console.log('[Recording][Resume] New Egress ID:', info?.egressId);
    } catch(err) {
      console.error('[Recording][Resume] API FAILED');
      throw err;
    }

    recording.recordingState = 'recording';
    recording.activeEgressId = info.egressId;
    recording.segments.push({
      egressId: info.egressId,
      status: 'EGRESS_STARTING',
      startedAt: new Date()
    });

    await recording.save();
    console.log('[Recording][Resume] Mongo updated');
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('[Recording][Error]', {
      operation: 'RESUME',
      traceId,
      roomId: req.body?.roomName,
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    res.status(500).json({ success: false, message: error.message });
  }
};"""

    stop_rec_replacement = """exports.stopRecording = async (req, res) => {
  const traceId = `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log('[Recording][Controller] ================================');
  console.log('[Recording][Controller] STOP RECORDING');
  console.log('[Recording][Controller] Time:', new Date().toISOString());
  console.log('[Recording][Controller] User ID:', req.user?._id);
  console.log('[Recording][Controller] User Role:', req.user?.role);
  console.log('[Recording][Controller] Room ID:', req.body?.roomName);

  try {
    const { roomName } = req.body;

    console.log('[Recording][Controller] Looking up LiveClass');
    const liveClass = await LiveClass.findById(roomName);
    if (!liveClass) return res.status(404).json({ success: false, message: 'LiveClass not found' });
    
    console.log('[Recording][Auth] Checking recording permission');
    console.log('[Recording][Auth] User ID:', req.user?._id);
    console.log('[Recording][Auth] Assigned Host ID:', liveClass.faculty);
    if (liveClass.faculty.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
      console.error('[Recording][Auth] RECORDING ACCESS DENIED');
      return res.status(403).json({ success: false, message: 'RECORDING_UNAUTHORIZED' });
    }
    console.log('[Recording][Auth] Authorized:', true);

    const recording = await ClassRecording.findOne({ roomName, recordingState: { $in: ['recording', 'paused'] } });
    if (!recording) return res.status(400).json({ success: false, message: 'RECORDING_NOT_FOUND' });

    console.log('[Recording][Stop] Request received');
    console.log('[Recording][Stop] Recording ID:', recording._id);
    console.log('[Recording][Stop] Current status:', recording.recordingState);
    console.log('[Recording][Stop] Egress ID:', recording.activeEgressId);

    if (recording.activeEgressId && recording.recordingState === 'recording') {
      console.log('[Recording][Stop] LiveKit request started');
      try {
        await egressClient.stopEgress(recording.activeEgressId);
        console.log('[Recording][Stop] LiveKit response received');
      } catch (err) {
        console.error('[Recording][Stop] Egress stop error', err);
      }
      recording.activeEgressId = null;
    }

    recording.recordingState = 'processing';
    await recording.save();
    console.log('[Recording][Stop] Mongo updated');

    await triggerMergeIfReady(recording._id);

    const io = req.app.get('io');
    if (io) {
      console.log('[Recording][Socket] Broadcasting recording-stopping');
      io.to(roomName).emit('class:recording-stopping', {
        roomId: roomName,
        recordingId: recording._id,
        status: 'stopping'
      });
    }

    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    console.error('[Recording][Error]', {
      operation: 'STOP',
      traceId,
      roomId: req.body?.roomName,
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    res.status(500).json({ success: false, message: error.message });
  }
};"""

    webhook_replacement = """exports.livekitWebhook = async (req, res) => {
  console.log('');
  console.log('[Recording][Webhook] ================================');
  console.log('[Recording][Webhook] WEBHOOK RECEIVED');
  console.log('[Recording][Webhook] Time:', new Date().toISOString());

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
       console.error('[Recording][Webhook] AUTHENTICATION FAILED');
       console.warn('Webhook signature validation failed or missing. Attempting direct parse.', e.message);
       try {
         event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(req.body.toString('utf8') || '{}');
       } catch(err) {
         console.error('[Recording][Webhook] PARSE FAILED');
         console.error('[Recording][Webhook] Error:', err.message);
         event = null;
       }
    }
    
    if (!event) return res.status(400).send('No event');

    console.log('[Recording][Webhook] Event:', event.event);
    console.log('[Recording][Webhook] Egress ID:', event.egressInfo?.egressId);
    console.log('[Recording][Webhook] Room:', event.egressInfo?.roomName);
    console.log('[Recording][Webhook] Status:', event.egressInfo?.status);

    if (event.event === 'egress_started') {
      console.log('[Recording][Webhook] EGRESS_STARTED');
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
      console.log('[Recording][Webhook] EGRESS_ENDED');
      const egressInfo = event.egressInfo;
      if (!egressInfo) return res.status(200).send();
      
      const egressId = egressInfo.egressId;
      const fileResults = egressInfo.fileResults;
      let filePath = '';
      let fileName = '';
      let duration = 0;
      let fileSize = 0;
      
      if (fileResults && fileResults.length > 0) {
        console.log('[Recording][File] Egress file received');
        const fileResult = fileResults[0];

        const actualFileName = path.basename(fileResult.filename);
        fileName = actualFileName;
        filePath = path.join(EGRESS_DIR, actualFileName);

        duration = fileResult.duration != null ? Math.floor(Number(fileResult.duration) / 1000000000) : 0;
        fileSize = fileResult.size != null ? Number(fileResult.size) : 0;

        console.log('[Recording][File] Filename:', fileName);
        console.log('[Recording][File] Path:', filePath);
        console.log('[Recording][File] Size:', fileSize);
        console.log('[Recording][File] Duration:', duration);

        console.log('[Recording][File] Checking filesystem');
        console.log('[Recording][File] Exists:', fs.existsSync(filePath));

        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          console.log('[Recording][File] FILE EXISTS');
          console.log('[Recording][File] Size bytes:', stat.size);
        } else {
          console.error('[Recording][File] FILE NOT FOUND');
          console.error('[Recording][File] Expected path:', filePath);
        }
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
            if (normalizedStatus === 'EGRESS_COMPLETE') {
              console.log('[Recording][Socket] Broadcasting recording-completed');
            } else {
              console.log('[Recording][Socket] Broadcasting recording-failed');
            }
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
        
        if (recording.recordingState === 'processing') {
          await triggerMergeIfReady(recording._id);
        }
      }
    } else if (event.event === 'egress_updated') {
      console.log('[Recording][Webhook] EGRESS_UPDATED');
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[Recording][Error]', {
      operation: 'WEBHOOK',
      message: error.message
    });
    res.status(500).send('Server Error');
  }
};"""

    merge_replacement = """const triggerMergeIfReady = async (recordingId) => {
  const traceId = `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const recording = await ClassRecording.findById(recordingId);
    if (!recording || recording.recordingState !== 'processing') return;

    const allComplete = recording.segments.every(s => 
      s.status === 'EGRESS_COMPLETE' || s.status === 'EGRESS_FAILED' || s.status === 'EGRESS_ABORTED' || s.status === 'EGRESS_LIMIT_REACHED'
    );

    if (allComplete) {
      const successfulSegments = recording.segments.filter(s => s.status === 'EGRESS_COMPLETE' && s.filePath && fs.existsSync(s.filePath));
      
      console.log('[Recording][Segments] Checking recording segments');
      console.log('[Recording][Segments] Recording ID:', recordingId);
      console.log('[Recording][Segments] Segment count:', successfulSegments.length);

      if (successfulSegments.length === 0) {
        console.error('[Recording][Segments] NO SEGMENTS FOUND');
        recording.recordingState = 'failed';
        recording.errorMessage = 'All segments failed or files missing';
        await recording.save();

        console.error('');
        console.error('[Recording] ========================================');
        console.error('[Recording] RECORDING FAILED');
        console.error('[Recording] Trace ID:', traceId);
        console.error('[Recording] Recording ID:', recordingId);
        console.error('[Recording] Error: No valid segments to merge');
        console.error('[Recording] ========================================');
        return;
      }

      successfulSegments.forEach(segment => {
        console.log('[Recording][Segments] Segment:', {
          filename: segment.fileName || segment.filePath,
          duration: segment.duration,
          size: segment.fileSize
        });
      });

      const pathsToMerge = successfulSegments.map(s => s.filePath);
      const safeCourseName = (recording.title || 'recording').replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      const finalFileName = `${safeCourseName}_Merged_${timestamp}_${Date.now()}.mp4`;
      const finalOutputPath = path.join(EGRESS_DIR, finalFileName);

      console.log('[Recording][FFmpeg] ================================');
      console.log('[Recording][FFmpeg] Starting merge');
      console.log('[Recording][FFmpeg] Input count:', pathsToMerge.length);
      console.log('[Recording][FFmpeg] Output:', finalOutputPath);
      console.log('[Recording][FFmpeg] PROCESS STARTED');

      try {
        await mergeSegments(pathsToMerge, finalOutputPath);
        
        console.log('[Recording][FFmpeg] MERGE SUCCESS');
        console.log('[Recording][FFmpeg] Output:', finalOutputPath);
        console.log('[Recording][FFmpeg] Output exists:', fs.existsSync(finalOutputPath));
        
        let totalDuration = 0;
        let totalSize = 0;
        successfulSegments.forEach(s => {
          totalDuration += (s.duration || 0);
          totalSize += (s.fileSize || 0);
        });

        if (fs.existsSync(finalOutputPath)) {
          const stat = fs.statSync(finalOutputPath);
          totalSize = stat.size;
        }

        console.log('[Recording][Mongo] Updating final recording');
        console.log('[Recording][Mongo] Recording ID:', recordingId);
        console.log('[Recording][Mongo] Final file:', finalFileName);
        console.log('[Recording][Mongo] Duration:', totalDuration);
        console.log('[Recording][Mongo] Size:', totalSize);

        recording.recordingState = 'completed';
        recording.fileName = finalFileName;
        recording.filePath = finalOutputPath;
        recording.duration = totalDuration;
        recording.fileSize = totalSize;
        recording.endedAt = new Date();
        await recording.save();

        console.log('[Recording][Mongo] FINAL RECORDING SAVED');
        console.log('[Recording][Mongo] Recording ID:', recordingId);
        console.log('[Recording][Mongo] Status:', 'completed');

        for (const segPath of pathsToMerge) {
          try { if (fs.existsSync(segPath)) fs.unlinkSync(segPath); } catch(e) {}
        }

        console.log('');
        console.log('[Recording] ========================================');
        console.log('[Recording] RECORDING COMPLETED SUCCESSFULLY');
        console.log('[Recording] Trace ID:', traceId);
        console.log('[Recording] Recording ID:', recordingId);
        console.log('[Recording] Egress ID:', recording.egressId);
        console.log('[Recording] Room:', recording.roomName);
        console.log('[Recording] Duration:', totalDuration);
        console.log('[Recording] File:', finalOutputPath);
        console.log('[Recording] ========================================');

      } catch (mergeError) {
        console.error('[Recording][FFmpeg] MERGE FAILED');
        console.error('[Recording][FFmpeg] Message:', mergeError.message);
        console.error('[Recording][FFmpeg][stderr]', mergeError.stderr || 'No stderr');
        
        console.error('[Recording][Mongo] FINAL UPDATE FAILED');
        console.error('[Recording][Mongo] Error:', mergeError.message);

        recording.recordingState = 'failed';
        recording.errorMessage = 'Merge failed: ' + mergeError.message;
        await recording.save();

        console.error('');
        console.error('[Recording] ========================================');
        console.error('[Recording] RECORDING FAILED');
        console.error('[Recording] Trace ID:', traceId);
        console.error('[Recording] Recording ID:', recordingId);
        console.error('[Recording] Error:', mergeError.message);
        console.error('[Recording] ========================================');
      }
    }
  } catch(error) {
    console.error('[Recording][Error]', {
      operation: 'MERGE',
      traceId,
      recordingId,
      message: error.message
    });
  }
};"""

    status_replacement = """exports.getRecordingStatus = async (req, res) => {
  console.log('[Recording][Status] Request received');
  console.log('[Recording][Status] Room ID:', req.params?.roomName);
  try {
    const { roomName } = req.params;
    const recording = await ClassRecording.findOne({ roomName }).sort({ createdAt: -1 });
    
    if (!recording) {
      console.log('[Recording][Status] No active recording found');
      return res.status(200).json({ success: true, data: { recordingState: 'idle' } });
    }
    
    console.log('[Recording][Status] Recording found');
    console.log('[Recording][Status] Recording ID:', recording._id);
    console.log('[Recording][Status] Status:', recording.recordingState);
    console.log('[Recording][Status] Egress ID:', recording.egressId);

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
};"""

    # We use regex to replace the function bodies robustly.
    import re
    
    # helper to replace function body
    def replace_func(name, replacement, content):
        pattern = re.compile(r'(?:const\s+' + name + r'\s*=\s*async\s*\(.*?\)\s*=>\s*\{|exports\.' + name + r'\s*=\s*async\s*\(.*?\)\s*=>\s*\{).*?(?=\n(?:const\s+\w+|exports\.\w+|// @desc|module\.exports)|\Z)', re.DOTALL)
        return pattern.sub(replacement, content, count=1)

    new_content = content
    new_content = replace_func('triggerMergeIfReady', merge_replacement, new_content)
    new_content = replace_func('startRecording', start_rec_replacement, new_content)
    new_content = replace_func('pauseRecording', pause_rec_replacement, new_content)
    new_content = replace_func('resumeRecording', resume_rec_replacement, new_content)
    new_content = replace_func('stopRecording', stop_rec_replacement, new_content)
    new_content = replace_func('livekitWebhook', webhook_replacement, new_content)
    new_content = replace_func('getRecordingStatus', status_replacement, new_content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("Replacements complete")

if __name__ == '__main__':
    main()
