const mongoose = require('mongoose');
require('dotenv').config();
const Course = require('./src/models/Course.model');
const Category = require('./src/models/Category.model');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const courses = await Course.find().populate('category');
  courses.forEach(c => {
    console.log(c.title);
    console.log(c.category);
  });
  process.exit(0);
});
