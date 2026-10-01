const mongoose = require('mongoose');

const zoomIntegrationSchema = new mongoose.Schema({
  accountId: {
    type: String,
    required: false
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ZoomIntegration', zoomIntegrationSchema);
