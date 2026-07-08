const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  general: {
    websiteName: { type: String, default: 'Dr. Sam Reefath Radiology Academy' },
    tagline: { type: String, default: 'Learn interpret and lead' },
    logoUrl: { type: String, default: '' },
    nameLogoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
  },
  contact: {
    publicEmail: { type: String, default: 'info@reefathradiology.com' },
    supportEmail: { type: String, default: 'support@reefathradiology.com' },
    primaryPhone: { type: String, default: '+44 20 7123 4567' },
    whatsapp: { type: String, default: '+44 7700 900077' },
    address: { type: String, default: '123 Medical Lane, London, UK, W1G 9HQ' },
  },
  social: {
    facebook: { type: String, default: 'reefathradiology' },
    instagram: { type: String, default: 'reefathradiology' },
    linkedin: { type: String, default: 'dr-sam-reefath-academy' },
    youtube: { type: String, default: 'reefathradiology' },
  },
  security: {
    enableRightClickProtection: { type: Boolean, default: true },
    enableCopyPasteProtection: { type: Boolean, default: true },
    enableWatermarking: { type: Boolean, default: true },
    enableExamSecurity: { type: Boolean, default: true },
    enableDownloadRestrictions: { type: Boolean, default: true },
  },
  auth: {
    minPasswordLength: { type: Number, default: 8 },
    requireUppercase: { type: Boolean, default: true },
    requireLowercase: { type: Boolean, default: true },
    requireNumbers: { type: Boolean, default: true },
    requireSpecial: { type: Boolean, default: true },
    sessionTimeout: { type: Number, default: 30 }, // minutes
    maxFailedAttempts: { type: Number, default: 5 },
    lockDuration: { type: Number, default: 30 }, // minutes
    notifyAdmin: { type: Boolean, default: true },
  },
  policies: {
    termsAndConditions: { type: String, default: 'Terms and conditions go here...' },
    privacyPolicy: { type: String, default: 'Privacy policy goes here...' },
    refundPolicy: { type: String, default: 'Refund policy goes here...' },
  }
}, { timestamps: true });

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
