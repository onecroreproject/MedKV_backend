require('dotenv').config();
const mongoose = require('mongoose');
const LiveClass = require('./src/models/LiveClass.model');

async function checkRecentMeetings() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    const recentClass = await LiveClass.findOne({ meetingProvider: 'zoom' }).sort({ createdAt: -1 });
    
    if (recentClass) {
        console.log('\n--- Most Recent Zoom Live Class ---');
        console.log('Title:', recentClass.title);
        console.log('Zoom ID:', recentClass.zoomId);
        console.log('Host Zoom User ID:', recentClass.hostZoomUserId); // Does this exist? Let's check schema.
        console.log('Start URL:', recentClass.zoomStartUrl);
    } else {
        console.log('No recent Zoom classes found.');
    }
  } catch (err) {
      console.error(err);
  } finally {
      mongoose.connection.close();
  }
}
checkRecentMeetings();
