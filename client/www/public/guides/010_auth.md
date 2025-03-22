# InstantDB Authentication Guide

This guide explains how to implement user authentication in your InstantDB applications. InstantDB offers multiple authentication methods to suit different application needs and user preferences.

## Authentication Options

InstantDB supports several authentication methods:

1. **Magic Code Authentication** - Email-based passwordless login
2. **Google OAuth** - Sign in with Google accounts
3. **Apple Sign In** - Sign in with Apple ID
4. **Clerk Integration** - Delegate auth to Clerk
5. **Custom Authentication** - Build your own auth flow with the Admin SDK

## Core Authentication Concepts

Before diving into specific methods, let's understand the key authentication concepts:

### Auth Lifecycle

1. **User initiates sign-in** - Triggers the auth flow via email, OAuth provider, etc.
2. **Verification** - User proves their identity (entering a code, OAuth consent, etc.)
3. **Token generation** - InstantDB generates a refresh token for the authenticated user
4. **Session establishment** - The token is used to create a persistent session
5. **User access** - The user can now access protected resources

### The `useAuth` Hook

All authentication methods use the `useAuth` hook to access the current auth state:

```javascript
function App() {
  const { isLoading, user, error } = db.useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Authentication error: {error.message}</div>;
  if (user) return <AuthenticatedApp user={user} />;
  return <UnauthenticatedApp />;
}
```

Now let's explore each authentication method in detail.

## Magic Code Authentication

Magic code authentication provides a passwordless login experience via email verification codes.
This method is user-friendly and secure, as it eliminates the need for passwords. This is the recommended approach for most applications.

❌ **Common mistake**: Using password-based authentication in client-side code

InstantDB does not provide built-in username/password authentication. If you need traditional password-based authentication, you must implement it as a custom auth flow using the Admin SDK.

### How It Works

1. User enters their email address
2. InstantDB sends a one-time verification code to the email
3. User enters the code
4. InstantDB verifies the code and authenticates the user

### Full Example

Here's a complete example of how to implement magic code authentication using
Next.js, React, and the InstantDB React SDK in a client-side application.

```typescript
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

// lib/db.ts
import { init } from '@instantdb/react';
import schema from './instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema
});


// app/page.tsx
"use client";

import React, { useState } from "react";
import { User } from "@instantdb/react";
import { db } from "../lib/db";

function App() {
  // ✅ Good: Use the `useAuth` hook to get the current auth state
  const { isLoading, user, error } = db.useAuth();

  // ✅ Good: Handle loading state
  if (isLoading) {
    return;
  }

  // ✅ Good: Handle error state
  if (error) {
    return <div className="p-4 text-red-500">Uh oh! {error.message}</div>;
  }

  // ✅ Good: Show authenticated content if user exists
  if (user) {
    // The user is logged in! Let's load the `Main`
    return <Main user={user} />;
  }
  // The user isn't logged in yet. Let's show them the `Login` component
  return <Login />;
}

function Main({ user }: { user: User }) {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Hello {user.email}!</h1>
      {/* ✅ Good: Use the `db.auth.signOut()` to sign out a user */}
      <button
        onClick={() => db.auth.signOut()}
        className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700"
      >
        Sign out
      </button>
    </div>
  );
}

function Login() {
  const [sentEmail, setSentEmail] = useState("");

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="max-w-sm">
        {!sentEmail ? (
          <EmailStep onSendEmail={setSentEmail} />
        ) : (
          <CodeStep sentEmail={sentEmail} />
        )}
      </div>
    </div>
  );
}

function EmailStep({ onSendEmail }: { onSendEmail: (email: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const email = inputEl.value;
    onSendEmail(email);
    // ✅ Good: Use the `sendMagicCode` method to send the magic code
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert("Uh oh :" + err.body?.message);
      onSendEmail("");
    });
  };
  return (
    <form
      key="email"
      onSubmit={handleSubmit}
      className="flex flex-col space-y-4"
    >
      <h2 className="text-xl font-bold">Let's log you in</h2>
      <p className="text-gray-700">
        Enter your email, and we'll send you a verification code. We'll create
        an account for you too if you don't already have one.
      </p>
      <input
        ref={inputRef}
        type="email"
        className="border border-gray-300 px-3 py-1  w-full"
        placeholder="Enter your email"
        required
        autoFocus
      />
      <button
        type="submit"
        className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700 w-full"
      >
        Send Code
      </button>
    </form>
  );
}

function CodeStep({ sentEmail }: { sentEmail: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const code = inputEl.value;
    // ✅ Good: Use the `signInWithMagicCode` method to sign in with the code
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      inputEl.value = "";
      alert("Uh oh :" + err.body?.message);
    });
  };

  return (
    <form
      key="code"
      onSubmit={handleSubmit}
      className="flex flex-col space-y-4"
    >
      <h2 className="text-xl font-bold">Enter your code</h2>
      <p className="text-gray-700">
        We sent an email to <strong>{sentEmail}</strong>. Check your email, and
        paste the code you see.
      </p>
      <input
        ref={inputRef}
        type="text"
        className="border border-gray-300 px-3 py-1  w-full"
        placeholder="123456..."
        required
        autoFocus
      />
      <button
        type="submit"
        className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700 w-full"
      >
        Verify Code
      </button>
    </form>
  );
}

export default App;
```

### Best Practices for Magic Code Auth

1. **Clear Error Handling** - Provide helpful error messages when code sending or verification fails
2. **Loading States** - Show loading indicators during async operations
3. **Resend Functionality** - Allow users to request a new code if needed

## Custom Authentication

For advanced use cases, you can build custom authentication flows using the InstantDB Admin SDK.

### Server-Side Implementation

We can use a Next.js API route to handle custom authentication logic. This example demonstrates a simple email/password validation, but you can adapt it to your needs.

```typescript
// pages/api/auth/login.ts
import { init } from '@instantdb/admin';
import { NextApiRequest, NextApiResponse } from 'next';

// Define the type for the request body
interface LoginRequest {
  email: string;
  password: string;
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { email, password } = req.body as LoginRequest;
  
  // Custom authentication logic
  const isValid = await validateCredentials(email, password);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  try {
    // ✅ Good: Now that we have validated the user, we can create a token
    // and return it to the client
    const token = await db.auth.createToken(email);
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Custom validation function
async function validateCredentials(email: string, password: string): Promise<boolean> {
  // Implement your custom validation logic
  // e.g., check against your database
  return true; // Return true if valid
}
```

### Client-Side Implementation

```typescript
// app/page.tsx
"use client";

import React, { useState } from "react";
import { db } from "../lib/db";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Call your custom authentication endpoint
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      if (!response.ok) {
        throw new Error('Authentication failed');
      }
      
      const { token } = await response.json();
      
      // ✅ Good: User was authenticated successfully, now sign in with the
      token
      await db.auth.signInWithToken(token);
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
```

## Google OAuth Authentication

To use Google OAuth with Instant use the docs at https://www.instantdb.com/docs/auth/google-oauth

## Apple Sign In

To use Apple Sign In with Instant use the docs at https://www.instantdb.com/docs/auth/apple

## Clerk Integration

To use Clerk with Instant use the docs at https://www.instantdb.com/docs/auth/clerk

## Authentication Best Practices

For most applications, magic code authentication should the default choice.

