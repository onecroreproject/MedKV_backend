const ZoomIntegration = require('../models/ZoomIntegration.model');

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
