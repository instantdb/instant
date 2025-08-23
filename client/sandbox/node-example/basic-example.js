import { init } from '@instantdb/node';

// Initialize the Instant client
const db = init({
  appId: 'your-app-id', // Replace with your actual app ID
});

// Example: Subscribe to all users
console.log('Subscribing to users...');
const unsubscribeUsers = db.subscribeQuery({ users: {} }, (result) => {
  if (result.error) {
    console.error('Query error:', result.error);
    return;
  }
  
  console.log(`Found ${result.data.users.length} users:`);
  result.data.users.forEach(user => {
    console.log(`- ${user.name} (${user.email})`);
  });
});

// Example: Create a new user
async function createUser() {
  const userId = crypto.randomUUID();
  console.log(`\nCreating user with ID: ${userId}`);
  
  try {
    await db.transact(
      db.tx.users[userId].update({
        name: 'Alice Smith',
        email: 'alice@example.com',
        createdAt: new Date().toISOString(),
      })
    );
    console.log('User created successfully!');
  } catch (error) {
    console.error('Failed to create user:', error);
  }
}

// Example: Subscribe to auth state
db.subscribeAuth((auth) => {
  if (auth.user) {
    console.log('\nAuthenticated as:', auth.user.email);
  } else {
    console.log('\nNot authenticated');
  }
});

// Example: Query with filters
async function queryActiveUsers() {
  console.log('\nQuerying active users...');
  
  try {
    const result = await db.queryOnce({
      users: {
        $: {
          where: {
            isActive: true,
          },
        },
      },
    });
    
    console.log(`Found ${result.data.users.length} active users`);
  } catch (error) {
    console.error('Query failed:', error);
  }
}

// Example: Real-time presence
function setupPresence() {
  console.log('\nSetting up presence...');
  
  const room = db.joinRoom('presence', 'main-room', {
    initialPresence: {
      name: 'Node.js Client',
      status: 'online',
      timestamp: Date.now(),
    },
  });
  
  // Subscribe to presence updates
  room.subscribePresence({}, (presence) => {
    console.log('Presence update:');
    console.log('- My presence:', presence.user);
    console.log('- Peers:', Object.keys(presence.peers).length);
  });
  
  // Update presence periodically
  setInterval(() => {
    room.publishPresence({
      timestamp: Date.now(),
    });
  }, 30000); // Every 30 seconds
  
  return room;
}

// Run examples
async function main() {
  console.log('Starting Instant Node.js example...\n');
  
  // Wait a bit for connection to establish
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Create a user
  await createUser();
  
  // Query users
  await queryActiveUsers();
  
  // Setup presence
  const room = setupPresence();
  
  // Keep the process running
  console.log('\nPress Ctrl+C to exit...');
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    unsubscribeUsers();
    room.leaveRoom();
    db.shutdown();
    process.exit(0);
  });
}

// Start the application
main().catch(console.error);