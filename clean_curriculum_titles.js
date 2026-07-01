const mongoose = require('mongoose');
const dotenv = require('dotenv');
const CourseModule = require('./src/models/CourseModule.model');
const Lesson = require('./src/models/Lesson.model');

dotenv.config();

const cleanTitles = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    // Clean Modules: remove 'Module \d+: '
    const modules = await CourseModule.find();
    let modUpdates = 0;
    for (let m of modules) {
      const match = m.title.match(/^Module\s+\d+:\s*(.*)/i);
      if (match) {
        m.title = match[1].trim();
        await m.save();
        modUpdates++;
      }
    }
    console.log(`Cleaned ${modUpdates} modules.`);

    // Clean Lessons: remove 'Lesson \d+\.\d+: '
    const lessons = await Lesson.find();
    let lessUpdates = 0;
    for (let l of lessons) {
      const match = l.title.match(/^Lesson\s+\d+\.\d+:\s*(.*)/i);
      if (match) {
        l.title = match[1].trim();
        await l.save();
        lessUpdates++;
      }
    }
    console.log(`Cleaned ${lessUpdates} lessons.`);

    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

cleanTitles();
