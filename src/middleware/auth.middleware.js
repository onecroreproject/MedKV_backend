const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Fallback: allow token in query param for browser-native video streaming
  // (browser <video> tag cannot set Authorization headers)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  // Make sure token exists
  if (!token) {
    if (req.originalUrl.includes('/start')) console.error('[Recording][AuthMiddleware] REJECTED', { status: 401, message: 'No token' });
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id);
    
    if(!req.user) {
        if (req.originalUrl.includes('/start')) console.error('[Recording][AuthMiddleware] REJECTED', { status: 401, message: 'User no longer exists' });
        return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    if (req.user.activeToken && req.user.activeToken !== token) {
        if (req.originalUrl.includes('/start')) console.error('[Recording][AuthMiddleware] REJECTED', { status: 401, message: 'SESSION_REVOKED' });
        return res.status(401).json({ success: false, message: 'SESSION_REVOKED' });
    }

    if (req.originalUrl.includes('/start')) {
      console.log('[Recording][AuthMiddleware] Authenticated', {
        userId: req.user?._id,
        role: req.user?.role
      });
    }

    next();
  } catch (err) {
    if (req.originalUrl.includes('/start')) console.error('[Recording][AuthMiddleware] REJECTED', { status: 401, message: 'Not authorized to access this route' });
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (req.originalUrl.includes('/start')) {
      console.log('[Recording][AuthMiddleware] START request reached');
    }
    if (!roles.includes(req.user.role)) {
      if (req.originalUrl.includes('/start')) {
         console.error('[Recording][AuthMiddleware] REJECTED', { status: 403, message: `User role ${req.user.role} is not authorized` });
      }
      return res.status(403).json({ 
        success: false, 
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};
