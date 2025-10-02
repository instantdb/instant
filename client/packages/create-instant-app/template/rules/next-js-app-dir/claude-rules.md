# About InstantDB

Instant is the Modern Firebase. With Instant you can easily build realtime and collaborative apps. You can get started for free at https://instantdb.com

# How to use Instant in projects

Instant offers client side javascript packages for vanilla JS, react, and react native. Instant also offers a javascript admin SDK that can be used on the backend.

If you want to use Instant with react you should only use `@instantdb/react`. For react-native you should only use `@instantdb/react-native`. For scripts or server environments you should only use the admin SDK `@instantdb/admin`. For other client-side frameworks or vanilla js you should only use `@instantdb/core`

CRITICAL: To use the admin SDK you MUST get an admin token for the app. You can get the admin token with the MCP tool via `create-app`. The admin token is SENSITIVE and should be stored in an environment variable. Do not hardcode it in your script.

CRITICAL: If you want to create seed data YOU MUST write a script that uses the admin SDK. DO NOT try to seed data on the client.

CRITICAL: Make sure to follow the rules of hooks. Remember, you can't have hooks show up conditionally.

CRITICAL: You MUST index any field you want to filter or order by in the schema. If you do not, you will get an error when you try to filter or order by it.

Here is how ordering works:

```
Ordering:        order: { field: 'asc' | 'desc' }

Example:         $: { order: { dueDate: 'asc' } }

Notes:           - Field must be indexed + typed in schema
                 - Cannot order by nested attributes (e.g. 'owner.name')
```

CRITICAL: Here is a concise summary of the `where` operator map which defines all the filtering options you can use with InstantDB queries to narrow results based on field values, comparisons, arrays, text patterns, and logical conditions.

```
Equality:        { field: value }

Inequality:      { field: { $ne: value } }

Null checks:     { field: { $isNull: true | false } }

Comparison:      $gt, $lt, $gte, $lte   (indexed + typed fields only)

Sets:            { field: { $in: [v1, v2] } }

Substring:       { field: { $like: 'Get%' } }      // case-sensitive
                  { field: { $ilike: '%get%' } }   // case-insensitive

Logic:           and: [ {...}, {...} ]
                  or:  [ {...}, {...} ]

Nested fields:   'relation.field': value
```

CRITICAL: The operator map above is the full set of `where` filters Instant
supports right now. There is no `$exists`, `$nin`, or `$regex`. And `$like` and
`$ilike` are what you use for `startsWith` / `endsWith` / `includes`.

CRITICAL: Pagination keys (`limit`, `offset`, `first`, `after`, `last`, `before`) only work on top-level namespaces. DO NOT use them on nested relations or else you will get an error.

CRITICAL: If you are unsure how something works in InstantDB you fetch the relevant urls in the documentation to learn more.

# Full Example App

Below is a full demo app built with InstantDB, Next.js, and TailwindCSS with the following features:

- Initiailizes a connection to InstantDB
- Defines schema for the app
- Authentication with magic codes
- Reads and writes data via `db.useQuery` and `db.transact`
- Ephemeral features like who's online and shout
- File uploads for avatars

Logic is split across three files:

- `lib/db.ts` -- InstantDB client setup
- `instant.schema.ts` - InstantDB schema, gives you type safety for your data!
- `app/page.tsx` - Main logic, mostly UI with some Instant magic :)

```typescript
/* FILE: lib/db.ts */
import { init } from '@instantdb/react';
import schema from '../instant.schema';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;
const db = init({ appId: APP_ID, schema });

export default db;

/* FILE: instant.schema.ts */
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    profiles: i.entity({
      handle: i.string(),
    }),
    posts: i.entity({
      text: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    userProfiles: {
      forward: { on: 'profiles', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
    },
    postAuthors: {
      forward: { on: 'posts', has: 'one', label: 'author' },
      reverse: { on: 'profiles', has: 'many', label: 'posts' },
    },
    profileAvatars: {
      forward: { on: 'profiles', has: 'one', label: 'avatar' },
      reverse: { on: '$files', has: 'one', label: 'profile' },
    },
  },
  rooms: {
    todos: {
      presence: i.entity({}),
      topics: {
        shout: i.entity({
          text: i.string(),
          x: i.number(),
          y: i.number(),
          angle: i.number(),
          size: i.number(),
        }),
      },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

/* FILE: app/page.tsx */
'use client';

import React, { useState, useEffect } from 'react';
import { id, lookup, InstaQLEntity } from '@instantdb/react';

import db from '../lib/db';
import schema from '../instant.schema';

// Instant utility types for query results
type PostsWithProfile = InstaQLEntity<
  typeof schema,
  'posts',
  { author: { avatar: {} } }
>;

function randomHandle() {
  const adjectives = ['Quick', 'Lazy', 'Happy', 'Sad', 'Bright', 'Dark'];
  const nouns = ['Fox', 'Dog', 'Cat', 'Bird', 'Fish', 'Mouse'];
  const randomAdjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
  return `${randomAdjective}${randomNoun}${randomSuffix}`;
}

// Write Data
// ---------
async function createProfile(userId: string) {
  // CRITICAL: transact is how you write data to the database
  // We want to block until the profile is created, so we use await
  await db.transact(
    db.tx.profiles[userId]
      .update({
        handle: randomHandle(),
      })
      .link({ user: userId }),
  );
}

function addPost(text: string, authorId: string | undefined) {
  db.transact(
    // CRITICAL: ids must be a valid UUID, so we use `id()` to generate one
    db.tx.posts[id()]
      .update({
        text,
        createdAt: Date.now(),
      })
      .link({ author: authorId }),
  );
}

function deletePost(postId: string) {
  db.transact(db.tx.posts[postId].delete());
}

// Ephemeral helpers
// ---------
function makeShout(text: string) {
  const maxX = window.innerWidth - 200; // Leave some margin
  const maxY = window.innerHeight - 100;
  return {
    text,
    x: Math.random() * maxX,
    y: Math.random() * maxY,
    angle: (Math.random() - 0.5) * 30,
    size: Math.random() * 20 + 18,
  };
}

function addShout({
  text,
  x,
  y,
  angle,
  size,
}: {
  text: string;
  x: number;
  y: number;
  angle: number;
  size: number;
}) {
  const shoutElement = document.createElement('div');
  shoutElement.textContent = text;
  shoutElement.style.cssText = `
    left: ${x}px;
    top: ${y}px;
    position: fixed;
    z-index: 9999;
    font-size: ${size}px;
    font-weight: bold;
    pointer-events: none;
    transition: opacity 2s ease-out;
    opacity: 1;
    font-family: system-ui, -apple-system, sans-serif;
    white-space: nowrap;
    transform: rotate(${angle}deg);
  `;
  document.body.appendChild(shoutElement);
  setTimeout(() => {
    shoutElement.style.opacity = '0';
  }, 100);
  setTimeout(() => {
    shoutElement.remove();
  }, 2100);
}

// Instant query Hooks
// ---------
function useProfile() {
  // CRITICAL: useUser can only be used inside a db.SignedIn component
  const user = db.useUser();
  const { data, isLoading, error } = db.useQuery({
    profiles: {
      $: { where: { 'user.id': user.id } },
      avatar: {},
    },
  });
  const profile = data?.profiles?.[0];

  return { profile, isLoading, error };
}

function useRequiredProfile() {
  const { profile } = useProfile();
  if (!profile) {
    throw new Error('useRequiredProfile must be used inside EnsureProfile');
  }

  return profile;
}

function usePosts(pageNumber: number, pageSize: number) {
  const { isLoading, error, data } = db.useQuery({
    posts: {
      $: {
        order: { createdAt: 'desc' },
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
      },
      author: {
        avatar: {},
      },
    },
  });

  return { isLoading, error, posts: data?.posts || [] };
}

// Auth Components
// ---------
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
      <h2 className="text-xl font-bold">Instant Demo app</h2>
      <p className="text-gray-700">
        This is a demo app for InstantDB with the following features:
      </p>
      <p className="text-gray-700">
        To try the app, enter your email, and we'll send you a verification
        code. We'll create an account for you too if you don't already have one.
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

function EnsureProfile({ children }: { children: React.ReactNode }) {
  const user = db.useUser();

  const { isLoading, profile, error } = useProfile();

  useEffect(() => {
    if (!isLoading && !profile) {
      createProfile(user.id);
    }
  }, [isLoading, profile, user.id]);

  if (isLoading) return null;
  if (error)
    return (
      <div className="p-4 text-red-500">Profile error: {error.message}</div>
    );
  if (!profile) return null; // Still creating profile...

  return <>{children}</>;
}

// Use the room for presence and topics
const room = db.room('todos', 'main');

// App Components
// ---------
function Main() {
  const [pageNumber, setPageNumber] = useState(1);
  const pageSize = 5;
  const { isLoading, error, posts } = usePosts(pageNumber, pageSize);

  const { peers } = db.rooms.usePresence(room);
  const numUsers = 1 + Object.keys(peers).length;

  db.rooms.useTopicEffect(room, 'shout', (message) => {
    addShout(message);
  });

  if (isLoading) {
    return;
  }
  if (error) {
    return <div className="p-4 text-red-500">Error: {error.message}</div>;
  }

  const loadNextPage = () => {
    setPageNumber(pageNumber + 1);
  };

  const loadPreviousPage = () => {
    setPageNumber(pageNumber - 1);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto max-w-4xl rounded-lg bg-white p-6">
        <div className="mb-6 flex items-start justify-between">
          <ProfileAvatar />
          <button
            onClick={() => db.auth.signOut()}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Sign out
          </button>
        </div>

        <div className="mb-6">
          <PostForm />
        </div>

        <div className="space-y-4">
          <PostList posts={posts} />
        </div>
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={loadPreviousPage}
            disabled={pageNumber <= 1}
            className={`rounded bg-gray-200 px-4 py-2 ${
              pageNumber <= 1 ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            Previous
          </button>
          <button
            onClick={loadNextPage}
            disabled={posts.length < pageSize}
            className={`rounded bg-gray-200 px-4 py-2 ${
              posts.length < pageSize ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            Next
          </button>
        </div>
        <div className="mt-4 text-center text-xs text-gray-500">
          {numUsers} user{numUsers > 1 ? 's' : ''} online
        </div>
      </div>
    </div>
  );
}

function ProfileAvatar() {
  const user = db.useUser();
  const profile = useRequiredProfile();
  const [isUploading, setIsUploading] = useState(false);
  const avatarPath = `${user.id}/avatar`;

  const handleAvatarDelete = async () => {
    if (!profile.avatar) return;
    db.transact(db.tx.$files[lookup('path', avatarPath)].delete());
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data } = await db.storage.uploadFile(avatarPath, file);
      await db.transact(db.tx.profiles[profile.id].link({ avatar: data.id }));
    } catch (error) {
      console.error('Upload failed:', error);
    }
    setIsUploading(false);
  };

  return (
    <div className="flex items-center gap-4">
      <label className="relative cursor-pointer">
        {profile.avatar ? (
          <img
            src={profile.avatar.url}
            alt={profile.handle}
            className="h-16 w-16 rounded-full border-2 border-gray-800 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-800 bg-white text-xl font-bold text-gray-800">
            {profile.handle[0].toUpperCase()}
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black bg-opacity-50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          onChange={handleAvatarUpload}
          className="hidden"
          disabled={isUploading}
        />
      </label>
      <div className="flex flex-col">
        <div className="font-medium">handle: {profile.handle}</div>
        <div className="text-sm">email: {user.email}</div>
        <button
          onClick={handleAvatarDelete}
          className="text-left text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-400"
          disabled={!profile.avatar || isUploading}
        >
          Delete Avatar
        </button>
      </div>
    </div>
  );
}

function PostForm() {
  const user = db.useUser();
  const [value, setValue] = useState('');

  const publishShout = db.rooms.usePublishTopic(room, 'shout');

  const handleSubmit = (action: string) => {
    if (!value.trim()) return;

    if (action === 'post') {
      addPost(value, user?.id);
    } else {
      const params = makeShout(value);
      addShout(params);
      publishShout(params);
    }
    setValue('');
  };

  return (
    <div className="space-y-3">
      <input
        className="w-full rounded-lg border-2 border-gray-800 px-4 py-3 focus:border-gray-600 focus:outline-none"
        autoFocus
        placeholder="What's on your mind?"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit('post')}
      />
      <div className="flex gap-3">
        <button
          className="rounded-full border-2 border-gray-800 bg-white px-6 py-2 font-medium hover:bg-gray-100"
          onClick={() => handleSubmit('post')}
        >
          Add to wall
        </button>
        <button
          className="rounded-full border-2 border-gray-800 bg-white px-6 py-2 font-medium hover:bg-gray-100"
          onClick={() => handleSubmit('shout')}
        >
          Shout to void
        </button>
      </div>
    </div>
  );
}

function PostList({ posts }: { posts: PostsWithProfile[] }) {
  const user = db.useUser();
  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <div
          key={post.id}
          className="rounded-lg border-2 border-gray-800 bg-white p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-800 bg-white font-bold text-gray-800">
              {post.author?.avatar ? (
                <img
                  className="h-full w-full rounded-full object-cover"
                  src={post.author.avatar.url}
                  alt={post.author.handle}
                />
              ) : (
                <span>{post.author?.handle[0].toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">
                    {post.author?.handle || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(post.createdAt).toLocaleString()}
                  </div>
                </div>
                {post.author?.id === user?.id && (
                  <button
                    onClick={() => deletePost(post.id)}
                    className="text-sm text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="mt-2 text-gray-800">{post.text}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// CRITICAL: Use db.SignedIn and db.SignedOut to handle authentication state
function App() {
  return (
    <div>
      <db.SignedIn>
        <EnsureProfile>
          <Main />
        </EnsureProfile>
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </div>
  );
}

export default App;
```

# Documentation

The bullets below are links to the InstantDB documentation. They provide detailed information on how to use different features of InstantDB. Each line follows the pattern of

- [TOPIC](URL): Description of the topic.

Fetch the URL for a topic to learn more about it.

- [Common mistakes](https://instantdb.com/docs/common-mistakes.md): Common mistakes when working with Instant
- [Initializing Instant](https://instantdb.com/docs/init.md): How to integrate Instant with your app.
- [Modeling data](https://instantdb.com/docs/modeling-data.md): How to model data with Instant's schema.
- [Writing data](https://instantdb.com/docs/instaml.md): How to write data with Instant using InstaML.
- [Reading data](https://instantdb.com/docs/instaql.md): How to read data with Instant using InstaQL.
- [Instant on the Backend](https://instantdb.com/docs/backend.md): How to use Instant on the server with the Admin SDK.
- [Patterns](https://instantdb.com/docs/patterns.md): Common patterns for working with InstantDB.
- [Auth](https://instantdb.com/docs/auth.md): Instant supports magic code, OAuth, Clerk, and custom auth.
- [Auth](https://instantdb.com/docs/auth/magic-codes.md): How to add magic code auth to your Instant app.
- [Managing users](https://instantdb.com/docs/users.md): How to manage users in your Instant app.
- [Presence, Cursors, and Activity](https://instantdb.com/docs/presence-and-topics.md): How to add ephemeral features like presence and cursors to your Instant app.
- [Instant CLI](https://instantdb.com/docs/cli.md): How to use the Instant CLI to manage schema.
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.