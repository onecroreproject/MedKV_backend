require('dotenv').config();
const mongoose = require('mongoose');
const { getValidToken } = require('./src/services/zoom.service');

async function checkZoomAccount() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    const token = await getValidToken();

    const response = await fetch('https://api.zoom.us/v2/users/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
        console.error('Failed to fetch from Zoom API:', await response.text());
        return;
    }

    const user = await response.json();
    
    // Mask email (e.g. s***a@gmail.com)
    let maskedEmail = user.email;
    if (user.email && user.email.includes('@')) {
      const emailParts = user.email.split('@');
      const prefix = emailParts[0];
      if (prefix.length > 2) {
        maskedEmail = prefix[0] + '***' + prefix[prefix.length - 1] + '@' + emailParts[1];
      } else {
        maskedEmail = '***@' + emailParts[1];
      }
    }
    
    // Mask ID
    let maskedId = user.id;
    if (user.id && user.id.length > 6) {
      maskedId = user.id.substring(0, 3) + '***' + user.id.substring(user.id.length - 3);
    }

    console.log('\n=======================================');
    console.log('[Zoom] Connected account display name:', user.first_name + ' ' + user.last_name);
    console.log('[Zoom] Connected account email:', maskedEmail);
    console.log('[Zoom] Connected account user ID:', maskedId);
    console.log('=======================================\n');

  } catch (error) {
    console.error('Error fetching Zoom account:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

checkZoomAccount();
