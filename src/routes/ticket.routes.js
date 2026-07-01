const express = require('express');
const {
  createTicket,
  getMyTickets,
  getAllTickets,
  replyToTicket,
  updateTicketStatus,
} = require('../controllers/ticket.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect); // Ensure all ticket routes require authentication

// Student routes
router.post('/', createTicket);
router.get('/my', getMyTickets);
router.post('/:id/reply', replyToTicket); // Both Student and Admin can reply

// Admin routes
router.get('/', authorize('Admin'), getAllTickets);
router.put('/:id/status', authorize('Admin'), updateTicketStatus);

module.exports = router;
