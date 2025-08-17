import WebSocket from 'ws';

console.log('Testing raw ws library behavior...\n');

const ws = new WebSocket('wss://api.instantdb.com/runtime/session?app_id=54d69382-c27c-4e54-b2ac-c3dcaef2f0ad', {
  rejectUnauthorized: false
});

let openCount = 0;

// Test 1: Using event listeners
ws.on('open', () => {
  console.log(`Event listener 'open' fired (count: ${++openCount})`);
});

// Test 2: Using onopen property
ws.onopen = () => {
  console.log(`Property 'onopen' fired`);
};

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('WebSocket closed');
  process.exit(0);
});

// Close after 2 seconds
setTimeout(() => {
  console.log('\nClosing WebSocket...');
  ws.close();
}, 2000);