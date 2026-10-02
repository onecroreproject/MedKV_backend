const mongoose = require('mongoose');

const uri = "mongodb+srv://prithuapp_db_user:eETUIeouSRU7Xipu@cluster0.x0vkq8e.mongodb.net/Medical-DB?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // We can just query the raw collection to avoid loading models that might have dependencies
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users'); // Usually pluralized collection name

    const emailsToCheck = ['krishna700011@gmail.com', 'sanjayp_yadava@yahoo.co.in'];

    for (const email of emailsToCheck) {
      const user = await usersCollection.findOne({ email: email });
      if (user) {
        console.log(`Email ${email} FOUND in users collection. Role: ${user.role}, Name: ${user.name}`);
      } else {
        console.log(`Email ${email} NOT FOUND in users collection.`);
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error connecting to DB:', err);
    process.exit(1);
  });
