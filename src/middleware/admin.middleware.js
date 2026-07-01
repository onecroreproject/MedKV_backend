const { protect, authorize } = require('./auth.middleware');

// Apply this to routes that require Admin access
exports.adminProtect = [protect, authorize('Admin')];
