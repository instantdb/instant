---
title: Guest Auth
description: Let your users try your app before creating an account
---

Instant supports guest authentication. This allows your users to try your app before signing up and ensures they can keep all their data when they decide to create a full account with their email.

## Signing in as a Guest

Use `db.auth.signInAsGuest()` to create a new guest user. This will create a new guest user with an id, but no email address.

```tsx
'use client';

import React, { useState } from 'react';
import { init, User } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

function App() {
  return (
    <>
      <db.SignedIn>
        <Main />
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </>
  );
}

function Main() {
  const user = db.useUser();
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">
        Hello {user.isGuest ? 'Guest' : user.email}!
      </h1>
      <button
        onClick={() => db.auth.signOut()}
        className="bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
      >
        Sign out
      </button>
    </div>
  );
}

function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-sm">
        <button
          onClick={() => db.auth.signInAsGuest()}
          className="w-full bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
        >
          Sign in as Guest
        </button>
      </div>
    </div>
  );
}

export default App;
```

## Upgrading to a full user

When a guest user is ready to create a permanent account, you can use any of Instant's sign-in methods. The guest user will be automatically upgraded to a full user.

Here is a full example using magic code auth:

```tsx {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init, User } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

function App() {
  return (
    <>
      <db.SignedIn>
        <Main />
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </>
  );
}

function Main() {
  const user: User = db.useUser();
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">
        Hello {user.isGuest ? 'Guest' : user.email}!
      </h1>
      <button
        onClick={() => db.auth.signOut()}
        className="bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
      >
        Sign out
      </button>
      {user.isGuest && <Upgrade />}
    </div>
  );
}

function Upgrade() {
  const [sentEmail, setSentEmail] = useState('');

  return (
    <div className="flex">
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

function Login() {
  const [sentEmail, setSentEmail] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-sm">
        {!sentEmail ? (
          <EmailStep onSendEmail={setSentEmail} />
        ) : (
          <CodeStep sentEmail={sentEmail} />
        )}
        <button
          onClick={() => {
            db.auth
              .signInAsGuest()
              .catch((err) => alert('Uh oh: ' + err.body?.message));
          }}
          className="mt-4 w-full bg-gray-600 px-3 py-1 font-bold text-white hover:bg-gray-700"
        >
          Try before signing up
        </button>
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
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert('Uh oh :' + err.body?.message);
      onSendEmail('');
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
        className="w-full border border-gray-300 px-3 py-1"
        placeholder="Enter your email"
        required
        autoFocus
      />
      <button
        type="submit"
        className="w-full bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
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
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      inputEl.value = '';
      alert('Uh oh :' + err.body?.message);
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
        className="w-full border border-gray-300 px-3 py-1"
        placeholder="123456..."
        required
        autoFocus
      />
      <button
        type="submit"
        className="w-full bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
      >
        Verify Code
      </button>
    </form>
  );
}

export default App;
```

## Handling conflicting users

If a guest user signs up with an email that is not already associated with an existing account, their user `id` remains the same, and they retain access to all data they created as a guest.

However, if a user with that email already exists, the guest user's data may need to be merged.

You can fetch the list of guest users for a user with this query:

```ts
const query = {
  $users: {
    $: {
      where: {
        linkedPrimaryUser: user.id,
      },
    },
  },
};
```

The linked guest users are also available on the user itself:

```ts
const query = {
  $users: {
    $: {
      where: {
        id: user.id,
      },
      linkedGuestUsers: {},
    },
  },
};
```

You can then query for the data owned by those guest users and transfer it to the primary account. The specific implementation will depend on your application's data model.

To enable your user to access the data stored by the guest users, you can update your rules to grant access:

```diff
{
  "todos": {
   "bind": [
    "isOwner", "data.owner == auth.id",
+   "isGuestOwner", "data.owner in auth.ref('$user.linkedGuestUsers.id')"
   ],
    "allow": {
-     "view": "isOwner",
+     "view": "isOwner || isGuestOwner",
      "create": "isOwner",
-     "update": "isOwner",
+     "update": "isOwner || isGuestOwner",
      "delete": "isOwner"
    }
  }
}
```

Here's an example of how you might transfer `todos` from a guest account to the primary user:

```ts
function App() {
  const user = db.useUser();

  useEffect(() => {
    if (user.isGuest) return;

    const transferGuestData = async () => {
      // Get the linked guest user
      const {
        data: { $users },
      } = await db.queryOnce({
        $users: {
          $: {
            where: { linkedPrimaryUser: user.id },
            limit: 1,
            order: { serverCreatedAt: desc },
          },
        },
      });
      const guestId = $users[0]?.id;
      if (!guestId) return;

      // Get the data for the guest user
      const {
        data: { todos },
      } = await db.queryOnce({
        todos: {
          $: {
            where: { owner: guestId },
          },
        },
      });
      if (!todos.length) return;

      // Update owner on all of the guest's todo entities
      const txes = todos.map((todo) =>
        db.tx.todos[todo.id].update({ owner: user.id }),
      );
      await db.transact(txes);
    };

    transferGuestData();
  }, [user]);
}
```
