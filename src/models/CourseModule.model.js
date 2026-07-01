const mongoose = require('mongoose');

const courseModuleSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.ObjectId,
    ref: 'Course',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Please add a module title'],
    trim: true,
  },
  description: {
    type: String,
  },
  order: {
    type: Number,
    default: 0,
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Reverse populate with lessons
courseModuleSchema.virtual('lessons', {
  ref: 'Lesson',
  localField: '_id',
  foreignField: 'module',
  justOne: false
});

module.exports = mongoose.model('CourseModule', courseModuleSchema);
