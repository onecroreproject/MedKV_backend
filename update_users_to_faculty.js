const mongoose = require('mongoose');

const uri = "mongodb+srv://prithuapp_db_user:eETUIeouSRU7Xipu@cluster0.x0vkq8e.mongodb.net/Medical-DB?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const emailsToUpdate = ['krishna700011@gmail.com', 'sanjayp_yadava@yahoo.co.in'];

    const result = await usersCollection.updateMany(
      { email: { $in: emailsToUpdate } },
      { $set: { role: 'Faculty' } }
    );
    
    console.log(`Matched ${result.matchedCount} users, modified ${result.modifiedCount} users to Faculty role.`);

    // Check again
    for (const email of emailsToUpdate) {
      const user = await usersCollection.findOne({ email: email });
      if (user) {
        console.log(`Email ${email} is now Role: ${user.role}, Name: ${user.name}`);
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error connecting to DB:', err);
    process.exit(1);
  });
