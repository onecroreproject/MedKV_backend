const { createClient } = require('redis');

async function test() {
  const client = createClient();
  await client.connect();
  try {
    const keys = ['test:1', 'test:2'];
    await client.del(keys); // This works
    console.log('del array worked');
  } catch(e) {
    console.log('del array failed', e.message);
  }

  try {
    let cursor = 0;
    const res = await client.scan(cursor, { MATCH: 'test:*', COUNT: 100 });
    console.log('scan worked', res);
  } catch(e) {
    console.log('scan failed', e.message);
  }
  
  process.exit(0);
}
test();
