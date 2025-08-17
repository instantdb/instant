import express from 'express';
import { init } from '@instantdb/node';
import cors from 'cors';

// Initialize Instant
const db = init({
  appId: 'your-app-id', // Replace with your actual app ID
});

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store active subscriptions for cleanup
const subscriptions = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    subscriptions: subscriptions.size,
  });
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const result = await db.queryOnce({ users: {} });
    res.json({
      success: true,
      data: result.data.users,
      count: result.data.users.length,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const result = await db.queryOnce({
      users: {
        $: {
          where: {
            id: req.params.id,
          },
        },
      },
    });
    
    const user = result.data.users[0];
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: user 
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create a new user
app.post('/api/users', async (req, res) => {
  try {
    const userId = crypto.randomUUID();
    const { name, email, role = 'user' } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and email are required' 
      });
    }
    
    await db.transact(
      db.tx.users[userId].update({
        name,
        email,
        role,
        createdAt: new Date().toISOString(),
        isActive: true,
      })
    );
    
    res.status(201).json({ 
      success: true, 
      data: { id: userId, name, email, role } 
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update a user
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.createdAt;
    
    await db.transact(
      db.tx.users[id].update({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
    
    res.json({ 
      success: true, 
      data: { id, ...updates } 
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete a user
app.delete('/api/users/:id', async (req, res) => {
  try {
    await db.transact(
      db.tx.users[req.params.id].delete()
    );
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Server-Sent Events endpoint for real-time updates
app.get('/api/users/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial connection message
  res.write('data: {"type": "connected"}\n\n');
  
  // Subscribe to users
  const unsubscribe = db.subscribeQuery({ users: {} }, (result) => {
    if (result.error) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: result.error.message 
      })}\n\n`);
      return;
    }
    
    res.write(`data: ${JSON.stringify({ 
      type: 'update', 
      users: result.data.users,
      count: result.data.users.length,
      timestamp: new Date().toISOString(),
    })}\n\n`);
  });
  
  // Store subscription for cleanup
  const subId = crypto.randomUUID();
  subscriptions.set(subId, unsubscribe);
  
  // Clean up on client disconnect
  req.on('close', () => {
    unsubscribe();
    subscriptions.delete(subId);
  });
});

// WebSocket-like endpoint using presence
app.post('/api/presence/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, data } = req.body;
    
    // This is just to demonstrate the concept
    // In a real app, you'd manage room connections differently
    const room = db.joinRoom('api', roomId, {
      initialPresence: {
        userId,
        ...data,
        joinedAt: new Date().toISOString(),
      },
    });
    
    // Store room reference (in production, use proper session management)
    const roomKey = `${roomId}:${userId}`;
    subscriptions.set(roomKey, () => room.leaveRoom());
    
    res.json({ 
      success: true, 
      message: 'Joined room successfully',
      roomId,
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Authentication endpoints
app.post('/api/auth/magic-code', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required' 
      });
    }
    
    await db.auth.sendMagicCode({ email });
    
    res.json({ 
      success: true, 
      message: 'Magic code sent to your email' 
    });
  } catch (error) {
    console.error('Error sending magic code:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and code are required' 
      });
    }
    
    const result = await db.auth.signInWithMagicCode({ email, code });
    
    res.json({ 
      success: true, 
      user: result.user 
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(401).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Express server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET    /health');
  console.log('  GET    /api/users');
  console.log('  GET    /api/users/:id');
  console.log('  POST   /api/users');
  console.log('  PUT    /api/users/:id');
  console.log('  DELETE /api/users/:id');
  console.log('  GET    /api/users/stream (SSE)');
  console.log('  POST   /api/presence/:roomId/join');
  console.log('  POST   /api/auth/magic-code');
  console.log('  POST   /api/auth/verify');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  
  // Clean up all subscriptions
  subscriptions.forEach(cleanup => cleanup());
  subscriptions.clear();
  
  // Shutdown Instant
  db.shutdown();
  
  // Close Express server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});