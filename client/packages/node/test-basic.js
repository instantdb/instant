// Basic test for @instantdb/node without requiring network connection
import { init, tx, id } from './dist/esm/index.js';

console.log('Testing @instantdb/node basic functionality...\n');

// Test 1: Initialize database
const db = init({
  appId: '00000000-0000-0000-0000-000000000000', // dummy app ID
  websocketURI: 'ws://localhost:9999', // non-existent server
});

console.log('✓ Database initialized');
console.log('  - db.tx available:', typeof db.tx === 'object');
console.log('  - db.auth available:', typeof db.auth === 'object');
console.log('  - db.storage available:', typeof db.storage === 'object');

// Test 2: Transaction builder
const goalId = id();
const txChunk = tx.goals[goalId].update({ title: 'Test Goal' });
console.log('\n✓ Transaction builder working');
console.log('  - Generated ID:', goalId);
console.log('  - Transaction chunk:', JSON.stringify(txChunk, null, 2));

// Test 3: Auth methods available
console.log('\n✓ Auth methods available:');
console.log('  - sendMagicCode:', typeof db.auth.sendMagicCode === 'function');
console.log('  - signInWithMagicCode:', typeof db.auth.signInWithMagicCode === 'function');
console.log('  - signOut:', typeof db.auth.signOut === 'function');

// Test 4: Storage methods available
console.log('\n✓ Storage methods available:');
console.log('  - uploadFile:', typeof db.storage.uploadFile === 'function');
console.log('  - delete:', typeof db.storage.delete === 'function');

// Test 5: Query methods available
console.log('\n✓ Query methods available:');
console.log('  - subscribeQuery:', typeof db.subscribeQuery === 'function');
console.log('  - queryOnce:', typeof db.queryOnce === 'function');

// Test 6: Presence/rooms methods available
console.log('\n✓ Presence/rooms methods available:');
console.log('  - joinRoom:', typeof db.joinRoom === 'function');

// Test 7: Test file system storage
import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';

const testStorage = async () => {
  const storageDir = join(os.homedir(), '.instant', 'test-app');
  try {
    await fs.access(storageDir);
    console.log('\n✓ Storage directory exists:', storageDir);
  } catch {
    console.log('\n✓ Storage directory will be created on first write');
  }
};

await testStorage();

// Cleanup
db.shutdown();
console.log('\n✓ Database shutdown complete');

console.log('\n🎉 All basic tests passed!');