const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const findAdmins = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    const admins = await collection.find({ role: 'Admin' }).toArray();
    console.log('Admins found:', admins.map(a => ({ email: a.email, name: a.name })));
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

findAdmins();
