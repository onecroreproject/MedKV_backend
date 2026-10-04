require('dotenv').config();
const Razorpay = require('razorpay');

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const paymentIds = [
  'pay_TjQLnh9gi5EJ7M'
];

const checkPayments = async () => {
  for (const pid of paymentIds) {
    try {
      console.log(`\n--- Fetching Razorpay details for Payment ID: ${pid} ---`);
      const payment = await instance.payments.fetch(pid);
      console.log(`Status: ${payment.status}`);
      console.log(`Amount: ${payment.amount / 100} ${payment.currency}`);
      console.log(`Method: ${payment.method}`);
      console.log(`Email: ${payment.email}`);
      console.log(`Contact: ${payment.contact}`);
      console.log(`Created At: ${new Date(payment.created_at * 1000).toLocaleString()}`);
      console.log(`Notes:`, payment.notes);
      console.log(`Description: ${payment.description}`);
    } catch (err) {
      console.error(`Error fetching payment ${pid}:`, err.message || err);
    }
  }
};

checkPayments();
