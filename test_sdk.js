const mongoose = require('mongoose');
require('dotenv').config();
const { getSdkCredentials } = require('./src/controllers/zoom.controller');
const LiveClass = require('./src/models/LiveClass.model');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const liveClass = await LiveClass.findOne({ meetingProvider: 'zoom' }).sort({ createdAt: -1 });
  if (!liveClass) {
    console.log('No live class found');
    process.exit(1);
  }

  const req = {
    params: { liveClassId: liveClass._id.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'Admin', email: 'admin@test.com', name: 'Admin' }
  };
  
  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      console.log('Status:', this.statusCode);
      console.log('Response:', data);
    }
  };
  
  await getSdkCredentials(req, res);
  process.exit(0);
}
test();
