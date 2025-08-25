import { init } from './dist/esm/index.js';

const APP_ID = '54d69382-c27c-4e54-b2ac-c3dcaef2f0ad';

console.log('Testing WebSocket connection...\n');

// Initialize with verbose logging
const db = init({
  appId: APP_ID,
  verbose: true,
});

console.log('Database initialized, waiting for connection...\n');

// Subscribe to connection status to see what's happening
const unsubConnection = db.subscribeConnectionStatus((status) => {
  console.log(`Connection status changed to: ${status}`);
});

// Wait for 5 seconds to observe the connection behavior
setTimeout(() => {
  console.log('\nShutting down...');
  unsubConnection();
  db.shutdown();
  process.exit(0);
}, 5000);