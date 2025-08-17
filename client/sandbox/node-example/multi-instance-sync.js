import { init } from '@instantdb/node';

// Configuration
const APP_ID = 'your-app-id'; // Replace with your actual app ID
const INSTANCE_NAME = process.env.INSTANCE_NAME || `instance-${process.pid}`;
const INSTANCE_COLOR = process.env.INSTANCE_COLOR || '\x1b[36m'; // Default cyan

// Initialize the Instant client
const db = init({ appId: APP_ID });

// Helper to log with instance name and color
function log(...args) {
  console.log(`${INSTANCE_COLOR}[${INSTANCE_NAME}]\x1b[0m`, ...args);
}

// Subscribe to messages
log('Starting up and subscribing to messages...');
const unsubscribeMessages = db.subscribeQuery(
  { 
    messages: {
      $: {
        order: {
          serverOrder: 'asc',
        },
      },
    },
  },
  (result) => {
    if (result.error) {
      log('Query error:', result.error);
      return;
    }
    
    // Display new messages
    const messages = result.data.messages;
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage.instanceName !== INSTANCE_NAME) {
        log(`📨 Received: "${latestMessage.text}" from ${latestMessage.instanceName}`);
      }
    }
  }
);

// Function to send a message
async function sendMessage(text) {
  const messageId = crypto.randomUUID();
  log(`📤 Sending: "${text}"`);
  
  try {
    await db.transact(
      db.tx.messages[messageId].update({
        text,
        instanceName: INSTANCE_NAME,
        timestamp: Date.now(),
        serverOrder: Date.now(), // For ordering
      })
    );
  } catch (error) {
    log('Failed to send message:', error);
  }
}

// Join a presence room to see other instances
const room = db.joinRoom('sync-demo', 'main', {
  initialPresence: {
    instanceName: INSTANCE_NAME,
    pid: process.pid,
    startTime: new Date().toISOString(),
    status: 'online',
  },
});

// Subscribe to presence to see other instances
room.subscribePresence({}, (presence) => {
  const peerCount = Object.keys(presence.peers).length;
  if (peerCount > 0) {
    log(`👥 Connected instances: ${peerCount + 1} (including this one)`);
    Object.values(presence.peers).forEach(peer => {
      log(`  - ${peer.instanceName} (PID: ${peer.pid})`);
    });
  }
});

// Send periodic heartbeat messages
let messageCount = 0;
const heartbeatInterval = setInterval(async () => {
  messageCount++;
  await sendMessage(`Heartbeat #${messageCount} from ${INSTANCE_NAME}`);
  
  // Update presence
  room.publishPresence({
    lastHeartbeat: new Date().toISOString(),
    messagesSent: messageCount,
  });
}, 5000); // Every 5 seconds

// Send initial message
setTimeout(async () => {
  await sendMessage(`Hello from ${INSTANCE_NAME}! 👋`);
}, 1000);

// Interactive mode - send messages from console input
if (process.stdin.isTTY) {
  log('Type messages to send to other instances (or "exit" to quit):');
  
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (data) => {
    const message = data.trim();
    if (message.toLowerCase() === 'exit') {
      shutdown();
    } else if (message) {
      await sendMessage(message);
    }
  });
}

// Graceful shutdown
function shutdown() {
  log('Shutting down...');
  clearInterval(heartbeatInterval);
  
  // Send goodbye message
  sendMessage(`Goodbye from ${INSTANCE_NAME}! 👋`).then(() => {
    // Update presence to offline
    room.publishPresence({ status: 'offline' });
    
    // Clean up
    setTimeout(() => {
      unsubscribeMessages();
      room.leaveRoom();
      db.shutdown();
      process.exit(0);
    }, 500);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Log startup info
log('='.repeat(50));
log('Multi-Instance Sync Demo');
log('='.repeat(50));
log('Run multiple instances of this script to see real-time sync!');
log('');
log('Examples:');
log('  INSTANCE_NAME=server1 INSTANCE_COLOR="\\x1b[32m" node multi-instance-sync.js');
log('  INSTANCE_NAME=server2 INSTANCE_COLOR="\\x1b[33m" node multi-instance-sync.js');
log('  INSTANCE_NAME=server3 INSTANCE_COLOR="\\x1b[35m" node multi-instance-sync.js');
log('='.repeat(50));