const Newsletter = require('../models/Newsletter');

exports.subscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Check if already subscribed
    let subscription = await Newsletter.findOne({ email: email.toLowerCase() });

    if (subscription) {
      if (subscription.status === 'unsubscribed') {
        subscription.status = 'active';
        await subscription.save();
        return res.status(200).json({ success: true, message: 'Successfully resubscribed to the newsletter!' });
      }
      return res.status(400).json({ success: false, message: 'Email is already subscribed to the newsletter' });
    }

    // Create new subscription
    subscription = await Newsletter.create({ email });

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to the newsletter!'
    });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({ success: false, message: 'Server error during subscription' });
  }
};
