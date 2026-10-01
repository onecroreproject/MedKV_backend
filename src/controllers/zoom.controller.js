const ZoomIntegration = require('../models/ZoomIntegration.model');
const LiveClass = require('../models/LiveClass.model');
const jwt = require('jsonwebtoken');
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

    const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
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
