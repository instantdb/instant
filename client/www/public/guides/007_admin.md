# InstantDB Server-Side Development Guide

This guide explains how to use InstantDB in server-side javascript environments

## Initializing the Admin SDK

For server-side operations, Instant exposes `@instantdb/admin`. This package has similar functionality to the client SDK but is designed specifically for server environments.

First, install the admin SDK:

```bash
npm install @instantdb/admin
```

Now you can use it in your project

```javascript
// ✅ Good: Proper server-side initialization
import { init, id } from '@instantdb/admin';

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
});
```

❌ **Common mistake**: Using client SDK on the server
```javascript
// ❌ Bad: Don't use the React SDK on the server
import { init } from '@instantdb/react'; // Wrong package!

const db = init({
  appId: process.env.INSTANT_APP_ID,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
});
```

Hardcoding or exposing your app id is fine but make sure to never expose
your admin token.

❌ **Common mistake**: Exposing admin token in client code
```javascript
// ❌ Bad: Never expose your admin token in client code
const db = init({
  appId: 'app-123',
  adminToken: 'admin-token-abc', // Hardcoded token = security risk!
});
```

For better type safety, include your schema:

```javascript
// ✅ Good: Using schema for type safety
import { init, id } from '@instantdb/admin';
import schema from '../instant.schema'; // Your schema file

const db = init({
  appId: process.env.INSTANT_APP_ID,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
  schema, // Add your schema here
});
```

## Reading Data from the Server

The structure of queries from the admin sdk is identical to the client SDK

```typescript
{
  namespace: {
    $: { /* operators for this namespace */ },
    linkedNamespace: {
      $: { /* operators for this linked namespace */ },
    },
  },
}
```

Use `db.query` in the admin SDK instead of `db.useQuery`. It is an async
API without loading states. We wrap queries in try catch blocks to handle
errors. Unlike the client SDK, queries in the admin SDK bypass permission
checks

```javascript
// ✅ Good: Server-side querying
const fetchTodos = async () => {
  try {
    const data = await db.query({ todos: {} });
    const { todos } = data;
    console.log(`Found ${todos.length} todos`);
    return todos;
  } catch (error) {
    console.error('Error fetching todos:', error);
    throw error;
  }
};
```

❌ **Common mistake**: Using client-side syntax
```javascript
// ❌ Bad: Don't use useQuery on the server
const { data, isLoading, error } = db.useQuery({ todos: {} }); // Wrong approach!
```


## Writing Data from the Server

Use `db.transact` in the admin SDK to create, update, and delete data.
`db.transact` has the same API and behaves the same in the admin and client SDK. 
The only difference is permission checks are bypassed in the admin SDK.

```javascript
// ✅ Good: Server-side transaction
const createTodo = async (title, dueDate) => {
  try {
    const result = await db.transact(
      db.tx.todos[id()].update({
        title,
        dueDate,
        createdAt: new Date().toISOString(),
        completed: false,
      })
    );
    
    console.log('Created todo with transaction ID:', result['tx-id']);
    return result;
  } catch (error) {
    console.error('Error creating todo:', error);
    throw error;
  }
};
```

## Impersonate a User

Ue `db.asUser` to enforce permission checks for queries and transactions. This
is **ONLY** available in the admin SDK. 

```typescript
// ✅ Good: Impersonating a user by email
const userDb = db.asUser({ email: userEmail });

// ✅ Good: Impersonating a user with a token
const userDb = db.asUser({ token: userToken });

// ✅ Good: Operating as a guest
const guestDb = db.asUser({ guest: true });
};
```


## Retrieve a user

Use `db.auth.getUser` to retrieve an app user. This is **ONLY* available in the admin SDk

```typescript
// ✅ Good: Retrieve a user by email
const user = await db.auth.getUser({ email: 'alyssa_p_hacker@instantdb.com' });

// ✅ Good: Retrieve a user by id
const user = await db.auth.getUser({ id: userId });

// ✅ Good: Retrieve a user by refresh_token.
const user = await db.auth.getUser({ refresh_token: userRefreshToken, });
```

## Delete a user

Use `db.auth.deleteUser` to delete an app user. This is **ONLY* available in the admin SDk

```typescript
// ✅ Good: Delete a user by email
const user = await db.auth.deleteUser({ email: 'alyssa_p_hacker@instantdb.com' });

// ✅ Good: Delete a user by id
const user = await db.auth.deleteUser({ id: userId });

// ✅ Good: Delete a user by refresh_token.
const user = await db.auth.deleteUser({ refresh_token: userRefreshToken, });
```

Note, this _only_ deletes the user record and any associated data with cascade on delete.
If there's additional data to delete you need to do an additional transaction.

## Sign Out Users

Use `db.auth.signOut(email: string)` to sign out an app user. This behaves
differently than the client sdk version. It will invalidate all a user's refresh
tokens and sign out a user everywhere.

```javascript
// ✅ Good: Sign out a user from the server
await db.auth.signOut(email);
```

## Creating Authenticated Endpoints

Use `db.auth.verifyToken` on the server to create authenticated endpoints

```javascript
// ✅ Good: Authenticated API endpoint
app.post('/api/protected-resource', async (req, res) => {
  try {
    // Get the token from request headers
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify the token
    const user = await db.auth.verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Token is valid, proceed with the authenticated request
    // The user object contains the user's information
    console.log(`Request from verified user: ${user.email}`);
    
    // Process the authenticated request
    const { data } = await db.asUser({ email: user.email }).query({
      profiles: { $: { where: { '$user.id': user.id } } }
    });
    
    return res.status(200).json({
      message: 'Authentication successful',
      profile: data.profiles[0]
    });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});
```

And on the client pass along the refresh token to the client

```javascript
// ✅ Good: Frontend calling an authenticated endpoint
const callProtectedApi = async () => {
  const { user } = db.useAuth();
  
  if (!user) {
    console.error('User not authenticated');
    return;
  }
  
  try {
    // ✅ Good: Send the user's refresh token to your endpoint
    const response = await fetch('/api/protected-resource', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.refresh_token}`
      },
      body: JSON.stringify({ /* request data */ })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
};
```

## Server-Side use cases

Here are some common use cases you can implement with the admin SDK

### Scheduled Jobs

Running periodic tasks with a scheduler (like cron):

```javascript
// ✅ Good: Scheduled cleanup job
const cleanupExpiredItems = async () => {
  const now = new Date().toISOString();
  
  // Find expired items
  const { expiredItems } = await db.query({
    items: {
      $: {
        where: {
          expiryDate: { $lt: now }
        }
      }
    }
  });
  
  // Delete them
  if (expiredItems.length > 0) {
    await db.transact(
      expiredItems.map(item => db.tx.items[item.id].delete())
    );
    console.log(`Cleaned up ${expiredItems.length} expired items`);
  }
};

// Run this with a scheduler
```

### Data Import/Export

```javascript
// ✅ Good: Exporting data without permission checks
const exportUserData = async (userId) => {
  const data = await db.query({
    profiles: {
      $: { where: { id: userId } },
      authoredPosts: {
        comments: {},
        tags: {}
      }
    }
  });
  
  return JSON.stringify(data, null, 2);
};
```

### Custom Authentication Flows

```javascript
// ✅ Good: Custom sign-up flow
const customSignUp = async (email, userData) => {
  // Create a user in your auth system
  const token = await db.auth.createToken(email);

  // Get the user
  const user = await db.auth.getUser({ refresh_token: token });
  
  // Create a profile with additional data
  await db.transact(
    db.tx.profiles[id()]
      .update({
        ...userData,
        createdAt: new Date().toISOString()
      })
      .link({ $users: user.id })
  );
  
  return user;
};
```

## Conclusion

The InstantDB admin SDK enables server-side operations, allowing you to:

- Run background tasks and scheduled jobs
- Implement custom authentication flows
- Perform administrative operations
- Manage user accounts securely

Always follow best practices by:

- Keeping your admin token secure
- Wrapping transactions in try/catch blocks to handle errors

Remember that the admin SDK bypasses permissions by default

