const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Use a dummy SMTP transporter like Mailtrap for testing, 
  // or simple console logging if no credentials exist.
  const transporterConfig = {
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  console.log("SMTP EMAIL: ", process.env.SMTP_EMAIL);
  console.log("SMTP PASSWORD: ", process.env.SMTP_PASSWORD);

  // Check if Gmail is used
  if (process.env.SMTP_EMAIL && process.env.SMTP_EMAIL.includes('@gmail.com')) {
    transporterConfig.service = 'gmail';
  } else {
    transporterConfig.host = process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io';
    transporterConfig.port = process.env.SMTP_PORT || 2525;
  }

  const transporter = nodemailer.createTransport(transporterConfig);

  const message = {
    from: `${process.env.FROM_NAME || 'MedicalKV Admin'} <${process.env.FROM_EMAIL || process.env.SMTP_EMAIL || 'noreply@medicalkv.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
    attachments: options.attachments || []
  };

  try {
    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
  } catch (error) {
    console.error('Email not sent:', error.message);
    throw new Error('Email could not be sent: ' + error.message);
  }
};

module.exports = sendEmail;
