const express = require('express');
const { 
  registerStudent, loginStudent, forgotPasswordStudent, resetPasswordStudent,
  registerFaculty, loginFaculty, forgotPasswordFaculty, resetPasswordFaculty,
  registerAdmin, loginAdmin, forgotPasswordAdmin, resetPasswordAdmin,
  getMe, validateResetToken, updateDetails, updatePassword, updatePreferences, updateTwoFactor, revokeSession
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Student routes
router.post('/student/register', registerStudent);
router.post('/student/login', loginStudent);
router.post('/student/forgotpassword', forgotPasswordStudent);
router.put('/student/resetpassword/:resettoken', resetPasswordStudent);

// Faculty routes
router.post('/faculty/register', registerFaculty);
router.post('/faculty/login', loginFaculty);
router.post('/faculty/forgotpassword', forgotPasswordFaculty);
router.put('/faculty/resetpassword/:resettoken', resetPasswordFaculty);

// Admin routes
router.post('/admin/register', registerAdmin);
router.post('/admin/login', loginAdmin);
router.post('/admin/forgotpassword', forgotPasswordAdmin);
router.put('/admin/resetpassword/:resettoken', resetPasswordAdmin);

// General routes
router.get('/validate-reset-token/:resettoken', validateResetToken);

// General protected routes
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);
router.put('/preferences', protect, updatePreferences);
router.put('/twofactor', protect, updateTwoFactor);
router.delete('/sessions/:sessionId', protect, revokeSession);

module.exports = router;
