const Settings = require('../models/Settings.model');

/**
 * @desc    Get platform settings
 * @route   GET /api/v1/settings
 * @access  Public
 */
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    
    // If no settings exist yet, create a default one
    if (!settings) {
      settings = await Settings.create({});
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Update platform settings
 * @route   PUT /api/v1/settings
 * @access  Private/Admin
 */
exports.updateSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = new Settings(req.body);
      await settings.save();
    } else {
      // Use findOneAndUpdate to deeply update fields if we pass nested objects
      settings = await Settings.findOneAndUpdate(
        {},
        { $set: req.body },
        { new: true, runValidators: true }
      );
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
