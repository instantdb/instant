const { init, tx, id } = require('./dist/commonjs/index.js');

async function createUserDemo() {
  console.log('🚀 InstantDB Node.js Demo - Creating a User\n');
  
  // Initialize the database
  const db = init({
    appId: '54d69382-c27c-4e54-b2ac-c3dcaef2f0ad',
  });

  console.log('✅ Database initialized\n');

  // Create a unique user ID
  const userId = id();
  const timestamp = new Date().toISOString();
  
  // Create the user with a specific name
  const userName = 'This is really from Node.js!';
  const userEmail = `node-user-${Date.now()}@example.com`;
  
  console.log('📝 Creating user with:');
  console.log(`   ID: ${userId}`);
  console.log(`   Name: ${userName}`);
  console.log(`   Email: ${userEmail}`);
  console.log(`   Created at: ${timestamp}\n`);

  try {
    // Create the transaction
    const result = await db.transact(
      tx.users[userId].update({
        name: userName,
        email: userEmail,
        createdAt: timestamp,
        source: 'Node.js Client',
        nodeVersion: process.version,
        platform: process.platform,
      })
    );

    console.log('✅ User created successfully!');
    console.log('Transaction ID:', result['tx-id']);
    console.log('Transaction status:', result['tx-status']);
    
    // Query the user to verify it was created
    console.log('\n🔍 Querying the created user...');
    const queryResult = await db.queryOnce({
      users: {
        $: {
          where: {
            id: userId
          }
        }
      }
    });

    if (queryResult.data.users && queryResult.data.users.length > 0) {
      console.log('\n✅ User found in database:');
      console.log(JSON.stringify(queryResult.data.users[0], null, 2));
    } else {
      console.log('\n❌ User not found in query result');
    }

    // Subscribe to all users to see real-time updates
    console.log('\n👀 Subscribing to all users...');
    const unsubscribe = db.subscribeQuery(
      { 
        users: {
          $: {
            order: {
              createdAt: 'desc'
            },
            limit: 5
          }
        }
      },
      (result) => {
        if (result.error) {
          console.error('Subscription error:', result.error);
          return;
        }
        console.log(`\n📊 Latest users (${result.data.users?.length || 0} total):`);
        result.data.users?.forEach((user, index) => {
          console.log(`${index + 1}. ${user.name} (${user.email}) - Created: ${user.createdAt}`);
        });
      }
    );

    // Keep the subscription active for a few seconds
    console.log('\n⏳ Keeping subscription active for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Clean up
    console.log('\n🧹 Cleaning up...');
    unsubscribe();
    db.shutdown();
    
    console.log('\n✅ Demo completed successfully!');
    console.log('🎉 The user was created from Node.js!');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    db.shutdown();
    process.exit(1);
  }
}

// Run the demo
createUserDemo().catch(console.error);