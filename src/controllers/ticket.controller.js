const Ticket = require('../models/Ticket.model');
const { successResponse, errorResponse } = require('../utils/response.util');

// @desc    Create a new support ticket
// @route   POST /api/v1/tickets
// @access  Private (Student)
exports.createTicket = async (req, res) => {
  try {
    const { subject, category, details } = req.body;

    if (!subject || !category || !details) {
      return res.status(400).json({ success: false, message: 'Please provide subject, category, and details' });
    }

    const ticket = await Ticket.create({
      student: req.user.id,
      subject,
      category,
      status: 'Open',
      responses: [
        {
          sender: 'Student',
          message: details,
        },
      ],
    });

    return successResponse(res, ticket, 'Ticket created successfully', 201);
  } catch (error) {
    console.error('Error creating ticket:', error);
    return errorResponse(res, 500, error.message);
  }
};

// @desc    Get all tickets for the logged-in student
// @route   GET /api/v1/tickets/my
// @access  Private (Student)
exports.getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ student: req.user.id })
      .sort({ createdAt: -1 });

    return successResponse(res, tickets, 'Tickets retrieved successfully');
  } catch (error) {
    console.error('Error getting student tickets:', error);
    return errorResponse(res, 500, error.message);
  }
};

// @desc    Get all tickets (Admin)
// @route   GET /api/v1/tickets
// @access  Private (Admin)
exports.getAllTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate('student', 'name email profileImage')
      .sort({ createdAt: -1 });

    return successResponse(res, tickets, 'All tickets retrieved successfully');
  } catch (error) {
    console.error('Error getting all tickets:', error);
    return errorResponse(res, 500, error.message);
  }
};

// @desc    Add a reply to a ticket
// @route   POST /api/v1/tickets/:id/reply
// @access  Private
exports.replyToTicket = async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Determine sender based on role
    const sender = (req.user.role === 'Admin') ? 'Admin' : 'Student';

    // Verify student ownership if not admin
    if (sender === 'Student' && ticket.student.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to reply to this ticket' });
    }

    ticket.responses.push({
      sender,
      message,
    });
    
    // Automatically reopen ticket if student replies to a closed ticket
    if (sender === 'Student' && (ticket.status === 'Resolved' || ticket.status === 'Closed')) {
      ticket.status = 'Open';
    }

    await ticket.save();

    return successResponse(res, ticket, 'Reply added successfully');
  } catch (error) {
    console.error('Error replying to ticket:', error);
    return errorResponse(res, 500, error.message);
  }
};

// @desc    Update ticket status
// @route   PUT /api/v1/tickets/:id/status
// @access  Private (Admin)
exports.updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return successResponse(res, ticket, 'Status updated successfully');
  } catch (error) {
    console.error('Error updating ticket status:', error);
    return errorResponse(res, 500, error.message);
  }
};
