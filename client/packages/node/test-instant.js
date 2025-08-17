import { init, id, tx } from './dist/esm/index.js';

const APP_ID = '54d69382-c27c-4e54-b2ac-c3dcaef2f0ad';

async function testInstantDB() {
  console.log('Testing @instantdb/node package...\n');

  // Initialize the database
  const db = init({
    appId: APP_ID,
    verbose: true, // Enable verbose logging to see what's happening
  });

  console.log('✓ Database initialized\n');

  // Test 1: Subscribe to a query
  console.log('Test 1: Testing subscribeQuery...');
  const unsubscribe = db.subscribeQuery({ users: {} }, (result) => {
    if (result.error) {
      console.error('Query error:', result.error);
    } else {
      console.log('Query result:', JSON.stringify(result.data, null, 2));
      console.log('✓ subscribeQuery working\n');
    }
  });

  // Give the subscription time to connect
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test 2: Create a transaction
  console.log('Test 2: Testing transact...');
  const userId = id();
  try {
    // Generate a unique email to avoid constraint violations
    const uniqueEmail = `test-${Date.now()}@example.com`;
    const result = await db.transact([
      tx.users[userId].update({
        name: 'Test User from Node.js',
        email: uniqueEmail,
        displayName: 'Test User from Node.js',
        status: 'active',
        createdAt: new Date().toISOString(),
      }),
    ]);
    console.log('Transaction result:', result);
    console.log('✓ transact working\n');
  } catch (error) {
    console.error('Transaction error:', error);
  }

  // Test 3: Query once
  console.log('Test 3: Testing queryOnce...');
  try {
    const result = await db.queryOnce({ users: {} });
    console.log('QueryOnce result:', JSON.stringify(result.data, null, 2));
    console.log('✓ queryOnce working\n');
  } catch (error) {
    console.error('QueryOnce error:', error);
  }

  // Test 4: Auth state
  console.log('Test 4: Testing auth...');
  const unsubAuth = db.subscribeAuth((auth) => {
    console.log('Auth state:', auth);
    console.log('✓ subscribeAuth working\n');
  });

  // Test 5: Connection status
  console.log('Test 5: Testing connection status...');
  const unsubConnection = db.subscribeConnectionStatus((status) => {
    console.log('Connection status:', status);
    if (status === 'authenticated') {
      console.log('✓ Connection established and authenticated\n');
    }
  });

  // Wait a bit to see the results
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Cleanup
  console.log('Cleaning up...');
  unsubscribe();
  unsubAuth();
  unsubConnection();
  db.shutdown();
  console.log('✓ Cleanup complete');

  process.exit(0);
}

// Run the tests
testInstantDB().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
