const ZoomIntegration = require('../models/ZoomIntegration.model');
const LiveClass = require('../models/LiveClass.model');
const ClassRecording = require('../models/ClassRecording.model');
const Recording = require('../models/Recording.model');
const Lesson = require('../models/Lesson.model');
const User = require('../models/User.model');
const Attendance = require('../models/Attendance.model');
const Settings = require('../models/Settings.model');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getHostZak } = require('../services/zoom.service');

// @desc    Redirect admin to Zoom for OAuth authorization
// @route   GET /api/zoom/oauth/authorize
// @access  Public (or protected by admin auth, but redirecting browser)
exports.authorize = (req, res) => {
  try {
    const clientId = process.env.ZOOM_CLIENT_ID;
    const redirectUri = process.env.ZOOM_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return res.status(500).json({ success: false, message: 'Zoom OAuth is not configured properly.' });
    }

    // Add a short-lived state token to prevent CSRF and unauthorized callbacks
    const stateToken = jwt.sign({ role: req.user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '10m' });

    const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateToken}`;
    
    res.redirect(zoomAuthUrl);
  } catch (error) {
    console.error('Error in Zoom authorize endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Failed to start Zoom authorization.' });
  }
};

// @desc    Handle Zoom OAuth callback and exchange code for tokens
// @route   GET /api/zoom/oauth/callback
// @access  Public (Callback from Zoom)
exports.callback = async (req, res) => {
  try {
    const code = req.query.code;
    
    if (!code) {
      return res.status(400).json({ success: false, message: 'Authorization code is missing.' });
    }

    const stateToken = req.query.state;
    if (!stateToken) {
      return res.status(403).json({ success: false, message: 'State parameter missing. Unauthorized OAuth callback.' });
    }
    
    try {
      const decoded = jwt.verify(stateToken, process.env.JWT_SECRET || 'secret');
      if (decoded.role !== 'Admin') {
         return res.status(403).json({ success: false, message: 'Only administrators can configure Zoom integration.' });
      }
    } catch(err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired state token. Unauthorized OAuth callback.' });
    }

    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const redirectUri = process.env.ZOOM_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
       console.error('Zoom OAuth credentials missing in environment variables');
       return res.status(500).json({ success: false, message: 'Zoom OAuth is not configured properly.' });
    }

    // Exchange code for token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    // Node.js 18+ has native fetch
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Zoom OAuth Error response:', data.error || data.reason || 'Unknown error');
      return res.status(response.status).json({ success: false, message: 'Failed to authorize with Zoom.' });
    }

    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));

    // Upsert the single global integration document
    await ZoomIntegration.findOneAndUpdate(
      {}, // matches the first document
      {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: expiresAt
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Redirect to Admin Panel (assuming it's running locally on port 5173 for admin)
    // The exact admin URL should be defined in .env, falling back to a safe route
    const adminFrontendUrl = process.env.ADMIN_URL || 'http://localhost:5173';
    res.redirect(`${adminFrontendUrl}/settings?zoom_auth=success`);

  } catch (error) {
    console.error('Error in Zoom callback endpoint:', error.message);
    res.status(500).json({ success: false, message: 'Failed to process Zoom callback.' });
  }
};

// @desc    Get Zoom SDK credentials for a live class
// @route   GET /api/zoom/sdk-credentials/:liveClassId
// @access  Private (Students, Faculty, Admin)
exports.getSdkCredentials = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const user = req.user;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass || liveClass.meetingProvider !== 'zoom') {
      return res.status(404).json({ success: false, message: 'Zoom Live Class not found.' });
    }

    // Determine host status
    const isAssignedFaculty = liveClass.faculty.toString() === user._id.toString();
    const isAdmin = user.role === 'Admin';
    const isHost = isAssignedFaculty || isAdmin;

    // Determine authorization
    let isAuthorized = isHost;

    if (!isHost && user.role.match(/student/i)) {
      if (liveClass.accessControl === 'all') {
        isAuthorized = true;
      } else if (liveClass.accessControl === 'selected' && liveClass.selectedStudents.includes(user._id)) {
        isAuthorized = true;
      } else if (liveClass.accessControl === 'course') {
        const isEnrolled = user.enrolledCourses.some(e => e.course.toString() === liveClass.course.toString());
        if (isEnrolled) {
          isAuthorized = true;
        }
      }
    }

    if (liveClass.status === 'Cancelled') {
      return res.status(403).json({ success: false, message: 'This class has been cancelled.' });
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'You are not authorized to join this class.' });
    }

    const sdkKey = process.env.ZOOM_SDK_KEY;
    const sdkSecret = process.env.ZOOM_SDK_SECRET;

    if (!sdkKey || !sdkSecret) {
      return res.status(500).json({ success: false, message: 'Zoom SDK credentials are not configured.' });
    }

    const meetingNumber = liveClass.zoomId;
    const role = isHost ? 1 : 0;

    const iat = Math.round(new Date().getTime() / 1000) - 30;
    const exp = iat + 60 * 60 * 2; // 2 hours

    const payload = {
      sdkKey: sdkKey,
      appKey: sdkKey, // for legacy compatibility
      mn: meetingNumber,
      role: role,
      iat: iat,
      exp: exp,
      tokenExp: exp
    };

    const signature = jwt.sign(payload, sdkSecret, { header: { alg: 'HS256', typ: 'JWT' } });

    const responsePayload = {
      success: true,
      signature: signature,
      meetingNumber: meetingNumber,
      passcode: liveClass.zoomPasscode,
      userName: user.name,
      userEmail: user.email,
      customerKey: user._id.toString(), // Used to reliably identify student in webhook
      sdkKey: sdkKey
    };

    if (isHost) {
      // Get ZAK token
      try {
        const zak = await getHostZak(liveClass.hostZoomUserId || user.email);
        responsePayload.zak = zak;
      } catch (err) {
        return res.status(400).json({ success: false, message: 'Assigned teacher is not connected to a Zoom account.' });
      }
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error('Error getting Zoom SDK credentials:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Zoom Webhook Endpoint
// @route   POST /api/zoom/webhook
// @access  Public (Zoom authenticated via headers)
exports.webhook = async (req, res) => {
  const zoomWebhookSecret = process.env.ZOOM_WEBHOOK_SECRET;

  try {
    // 1. Zoom Endpoint Validation
    if (req.body.event === 'endpoint.url_validation') {
      const plainToken = req.body.payload.plainToken;
      const hashedToken = crypto.createHmac('sha256', zoomWebhookSecret).update(plainToken).digest('hex');
      
      return res.status(200).json({
        plainToken: plainToken,
        encryptedToken: hashedToken
      });
    }

    // 2. Validate webhook event signature
    if (zoomWebhookSecret) {
      const timestamp = req.headers['x-zm-request-timestamp'];
      const signature = req.headers['x-zm-signature'];

      const message = `v0:${timestamp}:${JSON.stringify(req.body)}`;
      const hashForVerify = crypto.createHmac('sha256', zoomWebhookSecret).update(message).digest('hex');
      const signatureToVerify = `v0=${hashForVerify}`;

      if (signature !== signatureToVerify) {
        console.error('Invalid Zoom Webhook signature');
        return res.status(401).json({ message: 'Unauthorized' });
      }
    }

    // Acknowledge receipt to Zoom immediately
    res.status(200).send();

    // 3. Process the event
    const { event, payload } = req.body;

    if (event === 'recording.completed') {
      const meetingId = payload.object.id.toString(); // Zoom Meeting ID
      const recordingId = payload.object.uuid;
      const recordingFiles = payload.object.recording_files;
      
      // Find the MP4 file
      const mp4File = recordingFiles.find(f => f.file_type === 'MP4');
      
      if (!mp4File) return;

      // Find the class by zoomId, sorting by date desc to get the latest
      const liveClass = await LiveClass.findOne({ zoomId: meetingId }).sort({ date: -1 });
      
      if (!liveClass) {
        console.error(`Webhook: LiveClass not found for Zoom Meeting ID ${meetingId}`);
        return;
      }

      // Idempotency: check if recording already exists
      const existing = await ClassRecording.findOne({ zoomRecordingId: recordingId });
      if (existing) {
        console.log(`Webhook: Recording ${recordingId} already exists`);
        return;
      }

      // Determine duration in minutes based on Zoom payload
      let durationMins = payload.object.duration || 0;

      // Save recording metadata
      const newRecording = new ClassRecording({
        title: liveClass.title + ' Recording',
        course: liveClass.course,
        teacher: liveClass.faculty,
        roomName: liveClass._id.toString(), // Keep roomName as LiveClass ID for consistency
        recordingProvider: 'zoom',
        zoomMeetingId: meetingId,
        zoomRecordingId: recordingId,
        playbackUrl: payload.object.share_url,
        downloadUrl: mp4File.download_url,
        duration: durationMins,
        fileSize: mp4File.file_size || 0,
        status: 'COMPLETED',
        recordingState: 'completed',
        startedAt: new Date(payload.object.start_time),
        endedAt: new Date(new Date(payload.object.start_time).getTime() + (durationMins * 60000))
      });

      await newRecording.save();
      console.log(`Webhook: Stored Zoom Recording for Class ${liveClass.title}`);
      
      // Create a public Recording so it appears in the student dashboard automatically
      const durationFormatted = durationMins > 60 
        ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m` 
        : `${durationMins}m`;
        
      const publicRecording = new Recording({
        title: liveClass.title + ' Recording',
        description: `Cloud Recording for ${liveClass.title}`,
        course: liveClass.course,
        courseModule: liveClass.courseModule,
        lesson: liveClass.lesson,
        faculty: liveClass.faculty,
        liveClass: liveClass._id,
        duration: durationFormatted,
        videoUrl: `/api/v1/class-recordings/${newRecording._id}/stream`,
        isPublished: true,
        compressionStatus: 'completed' // Zoom cloud already processed it
      });
      await publicRecording.save();
      console.log(`Webhook: Created public Recording entry for Class ${liveClass.title}`);
      
      // Update the Lesson so the student's Course Learning tab sees the video
      if (liveClass.lesson) {
        await Lesson.findByIdAndUpdate(liveClass.lesson, {
          videoUrl: publicRecording.videoUrl,
          duration: durationFormatted
        });
        console.log(`Webhook: Updated Lesson videoUrl for ${liveClass.lesson}`);
        console.log(`Webhook: Updated Lesson videoUrl for ${liveClass.lesson}`);
      }
    } else if (event === 'meeting.started') {
      const meetingId = payload.object.id.toString();
      const liveClass = await LiveClass.findOne({ zoomId: meetingId }).sort({ date: -1 });
      if (liveClass && liveClass.roomStatus !== 'ended') {
        liveClass.status = 'Live Now';
        liveClass.roomStatus = 'active';
        if (!liveClass.startedAt) liveClass.startedAt = new Date(payload.object.start_time);
        await liveClass.save();
        console.log(`Webhook: Meeting Started for Class ${liveClass.title}`);
      }
    } else if (event === 'meeting.ended') {
      const meetingId = payload.object.id.toString();
      const liveClass = await LiveClass.findOne({ zoomId: meetingId }).sort({ date: -1 });
      if (liveClass) {
        liveClass.status = 'Completed';
        liveClass.roomStatus = 'ended';
        liveClass.endedAt = new Date(payload.object.end_time || Date.now());
        await liveClass.save();
        console.log(`Webhook: Meeting Ended for Class ${liveClass.title}`);
      }
    } else if (event === 'meeting.participant_joined') {
      const meetingId = payload.object.id.toString();
      const participant = payload.object.participant;
      const email = participant.email;
      const customerKey = participant.customer_key;
      
      const liveClass = await LiveClass.findOne({ zoomId: meetingId }).sort({ date: -1 });
      if (liveClass && (email || customerKey)) {
        // Exclude host from student attendance
        if (liveClass.hostZoomUserId !== email && liveClass.faculty.toString() !== customerKey && liveClass.faculty.toString() !== email) {
          const userQuery = customerKey ? { _id: customerKey } : { email };
          const user = await User.findOne(userQuery);
          if (user && user.role.match(/student/i)) {
            let attendance = await Attendance.findOne({ liveClass: liveClass._id, student: user._id, zoomMeetingId: meetingId });
            
            if (!attendance) {
              attendance = new Attendance({
                liveClass: liveClass._id,
                student: user._id,
                zoomMeetingId: meetingId,
                provider: 'zoom',
                joinTime: new Date(participant.join_time),
                status: 'Present',
                joinSessions: [{
                  joinTime: new Date(participant.join_time)
                }]
              });
            } else {
              // Check if we already have this exact join time (idempotency)
              const newJoinTime = new Date(participant.join_time).getTime();
              const isDuplicate = attendance.joinSessions.some(s => s.joinTime && s.joinTime.getTime() === newJoinTime);
              
              if (!isDuplicate) {
                // Check if there is already an open session, if so we close it with this join_time to prevent overlaps
                const openSession = attendance.joinSessions.find(s => !s.leaveTime);
                if (openSession) {
                   openSession.leaveTime = new Date(participant.join_time);
                   openSession.duration = Math.max(0, Math.round((openSession.leaveTime.getTime() - openSession.joinTime.getTime()) / 60000));
                }

                // Add a new session
                attendance.joinSessions.push({
                  joinTime: new Date(participant.join_time)
                });
              }
            }
            await attendance.save();
            console.log(`Webhook: Logged join for ${user.email} in ${liveClass.title}`);
          }
        }
      }
    } else if (event === 'meeting.participant_left') {
      const meetingId = payload.object.id.toString();
      const participant = payload.object.participant;
      const email = participant.email;
      const customerKey = participant.customer_key;
      
      const liveClass = await LiveClass.findOne({ zoomId: meetingId }).sort({ date: -1 });
      if (liveClass && (email || customerKey)) {
        const userQuery = customerKey ? { _id: customerKey } : { email };
        const user = await User.findOne(userQuery);
        if (user && user.role.match(/student/i)) {
          const leaveTime = new Date(participant.leave_time);
          let attendance = await Attendance.findOne({ liveClass: liveClass._id, student: user._id, zoomMeetingId: meetingId });
          
          if (!attendance) {
            // Out of order: left arrived before joined. Create it so we don't lose the record.
            attendance = new Attendance({
              liveClass: liveClass._id,
              student: user._id,
              zoomMeetingId: meetingId,
              provider: 'zoom',
              status: 'Absent',
              joinSessions: [{
                joinTime: leaveTime,
                leaveTime: leaveTime,
                duration: 0
              }]
            });
          } else {
            // Check for duplicate leave event
            const isDuplicate = attendance.joinSessions.some(s => s.leaveTime && s.leaveTime.getTime() === leaveTime.getTime());
            
            if (!isDuplicate) {
              attendance.leaveTime = leaveTime;
              
              // Find the active session and update it
              // Active session is the one with no leaveTime OR the latest one
              const activeSession = attendance.joinSessions.slice().reverse().find(s => !s.leaveTime) 
                                 || attendance.joinSessions[attendance.joinSessions.length - 1];
              
              if (activeSession) {
                if (!activeSession.leaveTime) {
                  activeSession.leaveTime = leaveTime;
                  const diffMins = Math.max(0, Math.round((leaveTime.getTime() - activeSession.joinTime.getTime()) / 60000));
                  activeSession.duration = diffMins;
                } else {
                  // All sessions are closed, but we got a leave event. It could be an out-of-order leave.
                  // We just push a zero duration session to record the timestamp if we really want, but skipping is safer.
                }
              }
            }
          }
          
          // Recalculate total duration
          let totalDur = 0;
          attendance.joinSessions.forEach(s => {
            if (s.duration) totalDur += s.duration;
          });
          attendance.duration = totalDur;
          
          // Calculate status based on Settings thresholds
          const settings = await Settings.findOne({});
          const presentThreshold = settings?.attendance?.presentThreshold || 75;
          const partialThreshold = settings?.attendance?.partialThreshold || 30;
          const classDur = liveClass.duration || 60;
          
          const attendancePercentage = (totalDur / classDur) * 100;
          if (attendancePercentage >= presentThreshold) {
            attendance.status = 'Present';
          } else if (attendancePercentage >= partialThreshold) {
            attendance.status = 'Partial';
          } else {
            attendance.status = 'Absent';
          }
          
          await attendance.save();
          console.log(`Webhook: Logged leave for ${user.email}, Total duration: ${totalDur}m, Status: ${attendance.status}`);
        }
      }
    }

  } catch (error) {
    console.error('Zoom Webhook Error:', error);
    // Don't send 500 if we already sent 200
    if (!res.headersSent) {
      res.status(500).send();
    }
  }
};
