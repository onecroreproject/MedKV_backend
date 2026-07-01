const User = require('../models/User.model');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');

exports.registerUser = async (userData, requiredRole) => {
  const { name, email, password, phoneNumber } = userData;
  
  const role = requiredRole;

  const userExists = await User.findOne({ email });
  if (userExists) {
    throw new Error('User already exists');
  }

  const user = await User.create({
    name, email, password, role, phoneNumber
  });

  return user;
};

exports.loginUser = async (email, password, requiredRole, clientInfo) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new Error('Email not registered');
  }

  if (requiredRole && user.role !== requiredRole) {
    throw new Error(`Access denied. Must be a ${requiredRole} to access this portal.`);
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  if (clientInfo) {
    const parser = new UAParser(clientInfo.userAgent);
    const parsed = parser.getResult();
    
    // Create a new session entry
    const newSession = {
      device: parsed.device.type === 'mobile' ? 'Mobile' : (parsed.device.type === 'tablet' ? 'Tablet' : 'Desktop'),
      os: parsed.os.name || 'Unknown OS',
      browser: parsed.browser.name || 'Unknown Browser',
      ip: clientInfo.ip || 'Unknown IP',
      location: 'Unknown Location', // Without GeoIP, this is just a placeholder
      lastActive: new Date()
    };
    
    user.sessions.push(newSession);
    
    // Keep max 10 sessions to prevent document from growing indefinitely
    if (user.sessions.length > 10) {
      user.sessions = user.sessions.slice(-10);
    }
    
    await user.save();
  }

  return user;
};

exports.generateToken = (id, rememberMe = false) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: rememberMe ? '30d' : process.env.JWT_EXPIRES_IN,
  });
};

exports.forgotPassword = async (email, requiredRole) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('There is no user with that email');
  }

  if (requiredRole && user.role !== requiredRole) {
    throw new Error(`Access denied. Make sure you use the correct portal for your role.`);
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  return { user, resetToken };
};

exports.resetPassword = async (resetToken, newPassword) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    throw new Error('Invalid or expired token');
  }

  // Set new password
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  
  await user.save();
  return user;
};

exports.validateResetToken = async (resetToken) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    throw new Error('Invalid or expired token');
  }

  return true;
};
