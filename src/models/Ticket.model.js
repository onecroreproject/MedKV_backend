const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Please add a subject for your ticket'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['Technical Issue', 'Billing & Payments', 'Course Content', 'Other'],
      required: [true, 'Please select a category'],
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
    },
    responses: [
      {
        sender: {
          type: String,
          enum: ['Student', 'Admin'],
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Ticket', ticketSchema);
