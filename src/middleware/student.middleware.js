const { protect, authorize } = require('./auth.middleware');

// Apply this to routes that require Student access
exports.studentProtect = [protect, authorize('Student', 'Admin')];
