const ZoomIntegration = require('../models/ZoomIntegration.model');

// Helper to get and refresh token if needed
const getValidToken = async () => {
  const integration = await ZoomIntegration.findOne({});
  if (!integration) {
    throw new Error('Zoom OAuth is not configured or authenticated.');
  }

  const now = new Date();
  // Buffer of 5 minutes
  if (integration.expiresAt.getTime() - 5 * 60 * 1000 < now.getTime()) {
    // Refresh token
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refreshToken
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Zoom token refresh failed: ${data.error || data.reason}`);
    }

    integration.accessToken = data.access_token;
    integration.refreshToken = data.refresh_token;
    integration.expiresAt = new Date(Date.now() + (data.expires_in * 1000));
    await integration.save();
  }

  return integration.accessToken;
};

// Helper to parse date/time to ISO
const getStartTime = (dateStr, timeStr) => {
  const d = new Date(dateStr);
  let hours = 0;
  let mins = 0;
  const timeParts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (timeParts) {
    hours = parseInt(timeParts[1], 10);
    mins = parseInt(timeParts[2], 10);
    if (timeParts[3] && timeParts[3].toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (timeParts[3] && timeParts[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  d.setHours(hours, mins, 0, 0);
  return d.toISOString();
};

exports.createZoomMeeting = async (liveClass, facultyEmail) => {
  const token = await getValidToken();
  const startTime = getStartTime(liveClass.date, liveClass.time);

  const payload = {
    topic: liveClass.title,
    type: 2, // Scheduled meeting
    start_time: startTime,
    duration: liveClass.duration || 60,
    settings: {
      host_video: true,
      participant_video: false,
      join_before_host: false,
      mute_upon_entry: true,
      waiting_room: true
    }
  };

  // Try to create meeting for the faculty user, fallback to 'me' if user doesn't exist in the Zoom account
  let userId = facultyEmail || 'me';
  
  try {
    let response = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = await response.json();
      if (data.code === 1001 && userId !== 'me') {
        // User not found, fallback to 'me'
        console.warn(`Zoom user ${facultyEmail} not found, falling back to 'me'`);
        userId = 'me';
        response = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } else {
        throw new Error(`Failed to create Zoom meeting: ${data.message || 'Unknown error'}`);
      }
    }

    const meetingData = await response.json();
    
    return {
      meetingId: meetingData.id.toString(),
      passcode: meetingData.password,
      joinUrl: meetingData.join_url,
      startUrl: meetingData.start_url,
      hostZoomUserId: meetingData.host_id
    };
  } catch (err) {
    console.error('Zoom API Error:', err);
    throw new Error(err.message || 'Error communicating with Zoom API');
  }
};

exports.updateZoomMeeting = async (meetingId, liveClass) => {
  if (!meetingId) return;

  const token = await getValidToken();
  const startTime = getStartTime(liveClass.date, liveClass.time);

  const payload = {
    topic: liveClass.title,
    start_time: startTime,
    duration: liveClass.duration || 60,
  };

  const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(`Failed to update Zoom meeting: ${data.message || 'Unknown error'}`);
  }
};

exports.deleteZoomMeeting = async (meetingId) => {
  if (!meetingId) return;

  const token = await getValidToken();

  const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const data = await response.json();
    console.warn(`Failed to delete Zoom meeting ${meetingId}: ${data.message || 'Unknown error'}`);
  }
};

exports.getHostZak = async (userId) => {
  const token = await getValidToken();
  const response = await fetch(`https://api.zoom.us/v2/users/${userId}/token?type=zak`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(`Failed to get ZAK: ${data.message || 'Unknown error'}`);
  }
  
  const data = await response.json();
  return data.token;
};
