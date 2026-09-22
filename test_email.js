require('dotenv').config({ path: __dirname + '/.env' });
const { sendEmail, generateHTMLTemplate } = require('./src/utils/email.util.js');

async function runTest() {
  console.log("Testing SMTP Configuration...");
  console.log("Host:", process.env.SMTP_HOST);
  console.log("Port:", process.env.SMTP_PORT);
  console.log("User:", process.env.SMTP_EMAIL);
  console.log("Pass:", process.env.SMTP_PASSWORD && process.env.SMTP_PASSWORD !== '[ENTER_YOUR_EMAIL_PASSWORD_HERE]' ? "********" : "NOT SET OR DEFAULT");
  
  if (!process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD === '[ENTER_YOUR_EMAIL_PASSWORD_HERE]') {
    console.error('\n❌ FAILURE: You have not entered your email password in the .env file yet.');
    process.exit(1);
  }

  try {
    const htmlMessage = `
      <p>Hello!</p>
      <p>If you are seeing this, your SMTP configuration with GoDaddy is working perfectly.</p>
    `;
    const html = generateHTMLTemplate('SMTP Configuration Success', htmlMessage);

    await sendEmail({
      email: process.env.SMTP_EMAIL, // sending to itself as a test
      subject: 'Test Email - Dr. Sam Reefath Radiology Academy',
      message: 'If you are seeing this, your SMTP configuration is working.',
      html
    });
    console.log('\n✅ SUCCESS: Email sent successfully! Check the inbox of ' + process.env.SMTP_EMAIL);
  } catch (err) {
    console.error('\n❌ FAILURE: Failed to send email.');
    console.error(err.message);
  }
}

runTest();
