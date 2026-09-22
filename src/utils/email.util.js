const nodemailer = require('nodemailer');
const path = require('path');

const generateHTMLTemplate = (title, bodyHtml, ctaText = null, ctaLink = null) => {
  let ctaHtml = '';
  if (ctaText && ctaLink) {
    ctaHtml = `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${ctaLink}" style="background-color: #0B1F4D; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 16px; display: inline-block;">
          ${ctaText}
        </a>
      </div>
    `;
  }

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 40px 20px; color: #333333;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
      <!-- Header -->
      <div style="background-color: #0B1F4D; padding: 30px 20px; text-align: center; border-bottom: 4px solid #D4AF37;">
        <img src="cid:academy_logo" alt="Dr. Sam Reefath Radiology Academy" style="max-height: 70px; width: auto;" />
      </div>
      
      <!-- Body -->
      <div style="padding: 40px 30px; font-size: 16px; line-height: 1.6; color: #444444;">
        ${bodyHtml}
        ${ctaHtml}
      </div>
      
      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 25px 20px; text-align: center; font-size: 13px; color: #888888; border-top: 1px solid #eeeeee;">
        <p style="margin: 0 0 10px 0; color: #0B1F4D; font-weight: bold; font-size: 14px;">Dr. Sam Reefath Radiology Academy</p>
        <p style="margin: 0;">Learn, Interpret and Lead.</p>
        <p style="margin: 15px 0 0 0;">© ${new Date().getFullYear()} All Rights Reserved.</p>
      </div>
    </div>
  </body>
  </html>
  `;
};

const sendEmail = async (options) => {
  const transporterConfig = {
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  if (process.env.SMTP_EMAIL && process.env.SMTP_EMAIL.includes('@gmail.com')) {
    transporterConfig.service = 'gmail';
  } else {
    transporterConfig.host = process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io';
    transporterConfig.port = process.env.SMTP_PORT || 2525;
  }

  const transporter = nodemailer.createTransport(transporterConfig);

  const attachments = options.attachments || [];
  
  // Attach the logo for CID referencing if HTML is used
  if (options.html) {
    attachments.push({
      filename: 'company_name_transparent.png',
      path: path.resolve(__dirname, '../../../adminpanel/src/assets/logos/company_name_transparent.png'),
      cid: 'academy_logo'
    });
  }

  const message = {
    from: `${process.env.FROM_NAME || 'Dr. Sam Reefath Radiology Academy'} <${process.env.FROM_EMAIL || 'info@reefathradiology.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
    attachments
  };

  try {
    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
  } catch (error) {
    console.error('Email not sent:', error.message);
    throw new Error('Email could not be sent: ' + error.message);
  }
};

module.exports = { sendEmail, generateHTMLTemplate };
