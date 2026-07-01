const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
dotenv.config();

const resetPassword = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    const email = 'admin@gadmin.com';
    const newPassword = 'admin'; // I will set it to 'admin'
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    const result = await collection.updateOne({ email }, { $set: { password: hashedPassword } });
    
    if (result.modifiedCount > 0) {
      console.log(`Successfully reset password for ${email}`);
    } else {
      console.log(`No user found with email ${email} or password already same.`);
    }
    
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

resetPassword();
