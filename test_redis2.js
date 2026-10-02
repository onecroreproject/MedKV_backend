const { createClient } = require('redis');

async function test() {
  const client = createClient();
  await client.connect();
  try {
    let cursor = 0;
    const res = await client.scan(String(cursor), { MATCH: 'test:*', COUNT: 100 });
    console.log('scan with string worked', res);
  } catch(e) {
    console.log('scan with string failed', e.message);
  }
  
  process.exit(0);
}
test();
