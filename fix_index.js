require('dotenv').config({ path: 'r:\\ClientProject\\MediacalKV\\backend\\.env' });
const mongoose = require('mongoose');

async function fixIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('classrecordings');
    
    // Drop the old index
    try {
      await collection.dropIndex('egressId_1');
      console.log('Dropped old egressId_1 index');
    } catch (e) {
      console.log('Index egressId_1 might not exist or already dropped:', e.message);
    }
    
    // Create new sparse index
    await collection.createIndex(
      { egressId: 1 },
      { unique: true, sparse: true, name: 'egressId_1' }
    );
    console.log('Created new sparse egressId_1 index');
    
    // Verify
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

fixIndex();
