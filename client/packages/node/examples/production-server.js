const { init, subscribeQuery, getConnectionStats, shutdown } = require('@instantdb/node');

// Initialize the database
const db = init({
  appId: process.env.INSTANT_APP_ID || '54d69382-c27c-4e54-b2ac-c3dcaef2f0ad',
});

console.log('Starting production server example...');

// Example 1: Using the production-ready subscribeQuery wrapper
const unsubscribe1 = subscribeQuery(
  db,
  { users: {} },
  (result) => {
    console.log('Users updated:', result.data.users?.length || 0, 'users');
  },
  'users-subscription'
);

// Example 2: Multiple subscriptions with automatic cleanup
const unsubscribe2 = subscribeQuery(
  db,
  { 
    posts: {
      $: {
        limit: 10,
        order: { serverCreatedAt: 'desc' }
      }
    }
  },
  (result) => {
    console.log('Recent posts:', result.data.posts?.length || 0, 'posts');
  },
  'posts-subscription'
);

// Example 3: Monitor connection and subscription stats
setInterval(() => {
  const stats = getConnectionStats();
  console.log('\n=== Connection Stats ===');
  console.log('Active connections:', stats.connections.activeConnections);
  console.log('Active subscriptions:', stats.subscriptions.activeSubscriptions);
  
  // Log detailed subscription info
  stats.subscriptions.subscriptions.forEach(sub => {
    console.log(`  - ${sub.id}: idle for ${Math.round(sub.idleTime / 1000)}s`);
  });
}, 10000); // Every 10 seconds

// Example 4: Simulate a long-running process with periodic queries
let queryCount = 0;
const queryInterval = setInterval(async () => {
  queryCount++;
  
  try {
    const result = await db.queryOnce({
      users: {
        $: {
          where: {
            isActive: true
          }
        }
      }
    });
    
    console.log(`\nQuery #${queryCount}: Found ${result.data.users?.length || 0} active users`);
  } catch (error) {
    console.error('Query error:', error);
  }
  
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 1000));
}, 15000); // Every 15 seconds

// Example 5: Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop intervals
  clearInterval(queryInterval);
  
  // Unsubscribe from queries
  console.log('Unsubscribing from queries...');
  unsubscribe1();
  unsubscribe2();
  
  // Get final stats
  const finalStats = getConnectionStats();
  console.log('Final stats:', {
    connections: finalStats.connections.activeConnections,
    subscriptions: finalStats.subscriptions.activeSubscriptions,
  });
  
  // Shutdown all connections
  console.log('Closing all connections...');
  shutdown();
  
  console.log('Shutdown complete.');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Example 6: Simulate memory-intensive operations
console.log('\nSimulating production workload...');
console.log('Press Ctrl+C to trigger graceful shutdown\n');

// Keep the process running
process.stdin.resume();