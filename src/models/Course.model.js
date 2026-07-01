const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a course title'],
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    required: [function() { return this.status === 'Published'; }, 'Please add a description'],
  },
  instructor: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  thumbnail: {
    type: String,
    default: 'no-photo.jpg',
  },
  previewVideoUrl: {
    type: String,
  },
  price: {
    type: Number,
    required: [function() { return this.status === 'Published'; }, 'Please add a course price'],
    default: 0,
  },
  originalPrice: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['Draft', 'Published'],
    default: 'Draft',
  },
  category: {
    type: mongoose.Schema.ObjectId,
    ref: 'Category',
    required: [function() { return this.status === 'Published'; }, 'Please add a category'],
  },
  duration: {
    type: String, // e.g. "30", "90", "180", "365", "lifetime"
    default: "lifetime"
  },
  level: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'],
    default: 'All Levels',
  },
  learningOutcomes: [{
    title: String,
    desc: String
  }],
  liveSessions: [{
    sessionType: { type: String, enum: ['Live', 'Recording'] },
    title: String,
    date: String,
    time: String,
    duration: String,
    accessibility: String,
    accessTerms: String
  }],
  pacsCases: [{
    title: String,
    scans: String,
    difficulty: String
  }],
  mockExams: [{
    title: String,
    questions: String,
    time: String,
    difficulty: String
  }],
  testimonials: [{
    name: String,
    role: String,
    review: String
  }],
  faqs: [{
    q: String,
    a: String
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Reverse populate with modules
courseSchema.virtual('modules', {
  ref: 'CourseModule',
  localField: '_id',
  foreignField: 'course',
  justOne: false
});

// Pre-save middleware to create slug from title if not provided
courseSchema.pre('save', function() {
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
});

module.exports = mongoose.model('Course', courseSchema);
