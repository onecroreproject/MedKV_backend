const authService = require('../services/auth.service');
const User = require('../models/User.model');
const sendEmail = require('../utils/email.util');

const sendAuthResponse = (user, statusCode, res, rememberMe = false) => {
  const token = authService.generateToken(user._id, rememberMe);
  res.status(statusCode).json({
    success: true, token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
};

const handleForgotPassword = async (req, res, role) => {
  try {
    const { user, resetToken } = await authService.forgotPassword(req.body.email, role);
    
    // Create reset url
    let clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    if (role === 'Admin' || role === 'Faculty') {
      clientUrl = process.env.ADMIN_URL || 'http://localhost:5174';
    }
    const resetUrl = `${clientUrl}/${role.toLowerCase()}/reset-password/${resetToken}`;
    
    const message = `You are receiving this email because you (or someone else) has requested the reset of a password for your ${role} account. \n\n Please click the following link to reset your password: \n\n ${resetUrl}`;
    
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password reset token',
        message
      });
      res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      res.status(500).json({ success: false, message: 'Email could not be sent' });
    }
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const handleResetPassword = async (req, res) => {
  try {
    const user = await authService.resetPassword(req.params.resettoken, req.body.password);
    sendAuthResponse(user, 200, res);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.validateResetToken = async (req, res) => {
  try {
    await authService.validateResetToken(req.params.resettoken);
    res.status(200).json({ success: true, message: 'Token is valid' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// --- STUDENT AUTH ---
exports.registerStudent = async (req, res) => {
  try { sendAuthResponse(await authService.registerUser(req.body, 'Student'), 201, res); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.loginStudent = async (req, res) => {
  try { 
    const clientInfo = { ip: req.ip, userAgent: req.headers['user-agent'] };
    const rememberMe = req.body.rememberMe === true;
    sendAuthResponse(await authService.loginUser(req.body.email, req.body.password, 'Student', clientInfo), 200, res, rememberMe); 
  } 
  catch (error) { res.status(401).json({ success: false, message: error.message }); }
};

exports.forgotPasswordStudent = async (req, res) => handleForgotPassword(req, res, 'Student');
exports.resetPasswordStudent = async (req, res) => handleResetPassword(req, res);

// --- FACULTY AUTH ---
exports.registerFaculty = async (req, res) => {
  try { sendAuthResponse(await authService.registerUser(req.body, 'Faculty'), 201, res); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.loginFaculty = async (req, res) => {
  try { 
    const clientInfo = { ip: req.ip, userAgent: req.headers['user-agent'] };
    sendAuthResponse(await authService.loginUser(req.body.email, req.body.password, 'Faculty', clientInfo), 200, res); 
  } 
  catch (error) { res.status(401).json({ success: false, message: error.message }); }
};

exports.forgotPasswordFaculty = async (req, res) => handleForgotPassword(req, res, 'Faculty');
exports.resetPasswordFaculty = async (req, res) => handleResetPassword(req, res);

// --- ADMIN AUTH ---
exports.registerAdmin = async (req, res) => {
  try { sendAuthResponse(await authService.registerUser(req.body, 'Admin'), 201, res); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

exports.loginAdmin = async (req, res) => {
  try { 
    const clientInfo = { ip: req.ip, userAgent: req.headers['user-agent'] };
    sendAuthResponse(await authService.loginUser(req.body.email, req.body.password, 'Admin', clientInfo), 200, res); 
  } 
  catch (error) { res.status(401).json({ success: false, message: error.message }); }
};

exports.forgotPasswordAdmin = async (req, res) => handleForgotPassword(req, res, 'Admin');
exports.resetPasswordAdmin = async (req, res) => handleResetPassword(req, res);

// --- GENERAL AUTH ---
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'enrolledCourses.course',
      populate: [
        { path: 'instructor', select: 'name profileImage' },
        { 
          path: 'modules',
          populate: { path: 'lessons' }
        }
      ]
    });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateDetails = async (req, res) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      phoneNumber: req.body.phoneNumber,
      gender: req.body.gender,
      dob: req.body.dob,
      qualification: req.body.qualification,
      specialization: req.body.specialization,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
    };

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!await user.matchPassword(req.body.currentPassword)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.password = req.body.newPassword;
    await user.save();

    sendAuthResponse(user, 200, res);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, {
      preferences: req.body.preferences
    }, { new: true, runValidators: true });

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateTwoFactor = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, {
      twoFactorEnabled: req.body.twoFactorEnabled
    }, { new: true, runValidators: true });

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.sessions = user.sessions.filter(
      (session) => session._id.toString() !== req.params.sessionId
    );
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, data: user.sessions });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
