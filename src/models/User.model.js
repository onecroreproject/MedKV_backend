const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false, // Don't return password by default
  },
  role: {
    type: String,
    enum: ['Student', 'Faculty', 'Admin'],
    default: 'Student',
  },
  phoneNumber: {
    type: String,
  },
  profileImage: {
    type: String,
    default: 'default.jpg'
  },
  isActive: { type: Boolean, default: true },
  twoFactorEnabled: { type: Boolean, default: false },
  gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'] },
  dob: { type: Date },
  qualification: { type: String },
  specialization: { type: String },
  address: { type: String },
  city: { type: String },
  state: { type: String },
  country: { type: String },
  preferences: {
    theme: { type: String, default: 'light' },
    emailNotifications: { type: Boolean, default: true },
    smsAlerts: { type: Boolean, default: false },
    liveClassReminder: { type: Boolean, default: true },
    dailyMcqReminder: { type: Boolean, default: true },
    language: { type: String, default: 'English' }
  },
  sessions: [
    {
      token: String,
      device: String,
      os: String,
      browser: String,
      ip: String,
      location: String,
      lastActive: { type: Date, default: Date.now }
    }
  ],
  enrolledCourses: [
    {
      course: { type: mongoose.Schema.ObjectId, ref: 'Course' },
      enrolledAt: { type: Date, default: Date.now },
      progress: { type: Number, default: 0 },
      validUntil: { type: Date, default: null } // null indicates lifetime access
    }
  ],

  completedLessons: [{ type: mongoose.Schema.ObjectId, ref: 'Lesson' }],
  learningMinutes: { type: Number, default: 0 },
  streakDays: { type: Number, default: 0 },
  lastActiveDate: { type: Date },
  averageMockScore: { type: Number, default: 0 },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, {
  timestamps: true
});

// Encrypt password using bcrypt
userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function() {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 5 * 60 * 1000; // 5 minutes

  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
