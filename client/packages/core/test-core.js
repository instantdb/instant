// Test file for @instantdb/core to compare with @instantdb/node behavior
import { init, tx, id } from '@instantdb/core';

const APP_ID = '54d69382-c27c-4e54-b2ac-c3dcaef2f0ad';

console.log('Testing @instantdb/core...\n');

const db = init({
  appId: APP_ID,
  // Optionally add schema
});

// Test 1: Basic Query
console.log('Test 1: Basic Query');
const unsubscribe = db.subscribeQuery(
  { todos: {} },
  (result) => {
    if (result.error) {
      console.error('Query error:', result.error);
    } else if (result.data) {
      console.log('Query result:', JSON.stringify(result.data, null, 2));
    }
  }
);

// Test 2: Transaction
console.log('\nTest 2: Transaction');
setTimeout(async () => {
  try {
    const todoId = id();
    console.log('Creating todo with id:', todoId);
    
    const result = await db.transact([
      tx.todos[todoId].create({
        text: 'Test todo from core package',
        done: false,
        createdAt: new Date().toISOString()
      })
    ]);
    
    console.log('Transaction result:', result);
  } catch (error) {
    console.error('Transaction error:', error);
  }
}, 2000);

// Test 3: QueryOnce
console.log('\nTest 3: QueryOnce');
setTimeout(async () => {
  try {
    const result = await db.queryOnce({ todos: {} });
    console.log('QueryOnce result:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error('QueryOnce error:', error);
  }
}, 4000);

// Test 4: Auth
console.log('\nTest 4: Auth');
setTimeout(async () => {
  try {
    // Check current auth state
    const authState = await new Promise((resolve) => {
      const unsubAuth = db.subscribeAuth((auth) => {
        unsubAuth();
        resolve(auth);
      });
    });
    
    console.log('Current auth state:', authState);
    
    // Try to sign in with email
    console.log('Attempting to send magic code...');
    await db.auth.sendMagicCode({ email: 'test@example.com' });
    console.log('Magic code sent successfully');
  } catch (error) {
    console.error('Auth error:', error);
  }
}, 6000);

// Keep the process running for 10 seconds
setTimeout(() => {
  console.log('\nTests completed. Exiting...');
  unsubscribe();
  process.exit(0);
}, 10000);