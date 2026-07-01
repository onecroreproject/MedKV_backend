const Enquiry = require('../models/Enquiry.model');
const sendEmail = require('../utils/email.util');

/**
 * @desc    Submit a new enquiry
 * @route   POST /api/v1/enquiries
 * @access  Public
 */
exports.submitEnquiry = async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and message' });
    }

    const enquiry = await Enquiry.create({
      name,
      email,
      message
    });

    res.status(201).json({
      success: true,
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Get all enquiries
 * @route   GET /api/v1/enquiries
 * @access  Private/Admin
 */
exports.getEnquiries = async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort('-createdAt');
    res.status(200).json({
      success: true,
      count: enquiries.length,
      data: enquiries
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Update enquiry status
 * @route   PUT /api/v1/enquiries/:id/status
 * @access  Private/Admin
 */
exports.updateEnquiryStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['New', 'Read', 'Resolved'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    res.status(200).json({
      success: true,
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Reply to an enquiry
 * @route   POST /api/v1/enquiries/:id/reply
 * @access  Private/Admin
 */
exports.replyEnquiry = async (req, res) => {
  try {
    const { replyText } = req.body;
    
    if (!replyText) {
      return res.status(400).json({ success: false, message: 'Please provide a reply message' });
    }

    const enquiry = await Enquiry.findById(req.params.id);

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    // Send email to user
    await sendEmail({
      email: enquiry.email,
      subject: `Response to your Enquiry: Dr. Sam Reefath Radiology Academy`,
      message: `Dear ${enquiry.name},\n\nThank you for reaching out.\n\n${replyText}\n\nBest Regards,\nAdmissions Team`
    });

    // Auto mark as resolved
    enquiry.status = 'Resolved';
    await enquiry.save();

    res.status(200).json({
      success: true,
      message: 'Reply sent successfully',
      data: enquiry
    });
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ success: false, message: 'Server error or Email failed', error: error.message });
  }
};
