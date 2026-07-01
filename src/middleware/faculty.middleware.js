const { protect, authorize } = require('./auth.middleware');

// Apply this to routes that require Faculty access
exports.facultyProtect = [protect, authorize('Faculty', 'Admin')];
