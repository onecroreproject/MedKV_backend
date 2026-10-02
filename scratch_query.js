require('dotenv').config();
const mongoose = require('mongoose');
const LiveClass = require('./src/models/LiveClass.model');

mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://drsamreefathacademy:Y6XU5h2mQ6CXY51U@drsam.x0vkq8e.mongodb.net/medical-academy?retryWrites=true&w=majority').then(async () => {
  const classes = await LiveClass.find({ title: { $in: ['t11', 't12', 't13'] } });
  console.log(classes.map(c => ({ title: c.title, provider: c.meetingProvider, zoomId: c.zoomId, status: c.status })));
  process.exit();
});
