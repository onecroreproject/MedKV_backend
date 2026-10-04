const crypto = require('crypto');

const secret = 'vPWn@vQ7PjYV8tY'; // The secret from your .env
const payload = {
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_test123',
        amount: 100,
        currency: 'INR',
        notes: {
          userId: 'test_user',
          courseId: 'test_course'
        }
      }
    }
  }
};

const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

async function testLiveWebhook() {
  console.log("Sending test webhook payload to LIVE server...");
  try {
    const response = await fetch('https://api.drsamreefathradiologyacademy.com/api/v1/payment/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    console.log(`Live Server Status: ${response.status}`);
    console.log(`Live Server Response: ${text}`);
  } catch (err) {
    console.log("Error reaching live server API... trying www.drsamreefathradiologyacademy.com");
    try {
      const response2 = await fetch('https://www.drsamreefathradiologyacademy.com/api/v1/payment/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature
        },
        body: JSON.stringify(payload)
      });
      const text2 = await response2.text();
      console.log(`Live Server Status: ${response2.status}`);
      console.log(`Live Server Response: ${text2}`);
    } catch (e2) {
      console.error(e2);
    }
  }
}

testLiveWebhook();
