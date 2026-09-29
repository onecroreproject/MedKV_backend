const mongoose = require('mongoose');
require('dotenv').config({ path: 'r:\\ClientProject\\MediacalKV\\backend\\.env' });
const ClassRecording = require('./src/models/ClassRecording.model');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const recordings = await ClassRecording.find({ recordingState: 'processing' }).sort({ createdAt: -1 });
    console.log(JSON.stringify(recordings, null, 2));
    mongoose.disconnect();
  });
