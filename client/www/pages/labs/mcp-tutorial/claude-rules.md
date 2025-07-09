# About InstantDB

Instant is the Modern Firebase. With Instant you can easily build realtime and
collaborative apps. You can get started for free at https://instantdb.com

# How to use Instant in projects

Instant offers client side javascript packages for vanilla JS, react,
and react native. Instant also offers a javascript admin SDK that can be used on
the backend.

If you want to use Instant with react you should only use `@instantdb/react`. For react-native you should
only use `@instantdb/react-native`. For the admin SDK you should only use
`@instantdb/admin`. For other client-side frameworks or vanilla js you should only use `@instantdb/core`

You cannot use Instant on the backend outside of the admin SDK at the moment.

# Full Example App

Below is a full demo app built with InstantDB, Next.js, and TailwindCSS with the following features:

- Initiailizes a connection to InstantDB
- Defines schema and permissions for the app
- Authentication with magic codes
- Reads and writes data via `db.useQuery` and `db.transact`
- Ephemeral features like who's online and shout
- File uploads for avatars

Logic is split across four files:

- `lib/db.ts` -- InstantDB client setup
- `instant.schema.ts` - InstantDB schema, gives you type safety for your data!
- `instant.perms.ts` - InstantDB permissions, not required for this app, but we still included to show how to restrict access to your data.
- `app/page.tsx` - Main logic, mostly UI with some Instant magic :)

```typescript
/* FILE: lib/db.ts */
import { init } from '@instantdb/react';
import schema from "../instant.schema"

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;
const db = init({ appId: APP_ID, schema });

export default db;

/* FILE: instant.schema.ts */
import { i } from "@instantdb/react";

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
      // IMPORTANT: DO NOT USE i.date() FOR DATES, USE i.number() INSTEAD
      // InstantDB stores dates as timestamps (milliseconds since epoch)
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    userProfiles: {
      forward: { on: "profiles", has: "one", label: "user" },
      reverse: { on: "$users", has: "one", label: "profile" },
    },
    postAuthors: {
      forward: { on: "posts", has: "one", label: "author", required: true },
      reverse: { on: "profiles", has: "many", label: "posts" },
    },
    profileAvatars: {
      forward: { on: "profiles", has: "one", label: "avatar" },
      reverse: { on: "$files", has: "one", label: "profile" },
    }
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
        })
      },
    }
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema { }
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

/* FILE: instant.perms.ts */
import type { InstantRules } from "@instantdb/react";

const rules = {
  $files: {
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: ["isOwner", "auth.id != null && data.path.startsWith(auth.id + '/')"]
  },
  profiles: {
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "false",
    },
    bind: ["isOwner", "auth.id != null && auth.id == data.id"]
  },
  posts: {
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    // IMPORTANT: data.ref returns an array so we MUST use `in`
    bind: ["isOwner", "auth.id in data.ref('author.id')"]
  }
} satisfies InstantRules;

export default rules;

/* FILE: app/page.tsx */
"use client";

import React, { useState, useEffect } from "react";
import { id, lookup, InstaQLEntity, User } from "@instantdb/react";

import db from "../lib/db";
import schema from "../instant.schema";

// Instant utility types for query results
type ProfileWithAvatar = InstaQLEntity<typeof schema, "profiles", { avatar: {} }>;
type PostsWithProfile = InstaQLEntity<typeof schema, "posts", { author: { avatar: {} } }>;

function randomHandle() {
  const adjectives = ["Quick", "Lazy", "Happy", "Sad", "Bright", "Dark"];
  const nouns = ["Fox", "Dog", "Cat", "Bird", "Fish", "Mouse"];
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomSuffix = Math.floor(Math.random() * 9000) + 1000
  return `${randomAdjective}${randomNoun}${randomSuffix}`;
}

// Write Data
// ---------
async function createProfile(userId: string) {
  // IMPORTANT: transact is how you write data to the database
  // We want to block until the profile is created, so we use await
  await db.transact(
    db.tx.profiles[userId].update({
      handle: randomHandle(),
    }).link({ user: userId })
  );
}

function addPost(text: string, authorId: string | undefined) {
  db.transact(
    // IMPORTANT: ids must be a valid UUID, so we use `id()` to generate one
    db.tx.posts[id()].update({
      text,
      createdAt: Date.now(),
    }).link({ author: authorId })
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

function addShout({ text, x, y, angle, size }: { text: string, x: number, y: number, angle: number, size: number }) {
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
  const { user } = db.useAuth();
  if (!user) {
    throw new Error("useProfile must be used after auth");

  }
  const { data, isLoading, error } = db.useQuery({
    profiles: {
      $: { where: { "user.id": user.id } },
      avatar: {},
    }
  });
  const profile = data?.profiles?.[0];

  return { profile, isLoading, error };
}

function useAuthAndProfile(): { user: User, profile: ProfileWithAvatar } {
  const { user } = db.useAuth();
  const { profile } = useProfile();
  if (!user || !profile) {
    throw new Error("useAuthAndProfile must be used after auth and profile are loaded");
  }
  return { user, profile }
}

function usePosts(pageNumber: number, pageSize: number) {
  const { isLoading, error, data } = db.useQuery({
    posts: {
      $: {
        order: { createdAt: "desc" },
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
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, error } = db.useAuth();

  if (isLoading) return null;
  if (error) return <div className="p-4 text-red-500">Auth error: {error.message}</div>;
  if (!user) return <Login />;

  return <>{children}</>;
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
      <h2 className="text-xl font-bold">Instant Demo app</h2>
      <p className="text-gray-700">
        To try the app, enter your email, and we'll send you a verification code. We'll create
        an account for you too if you don't already have one.
      </p>
      <input ref={inputRef} type="email" className="border border-gray-300 px-3 py-1  w-full" placeholder="Enter your email" required autoFocus />
      <button type="submit" className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700 w-full" >
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
      <input ref={inputRef} type="text" className="border border-gray-300 px-3 py-1  w-full" placeholder="123456..." required autoFocus />
      <button type="submit" className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700 w-full" >
        Verify Code
      </button>
    </form>
  );
}

function EnsureProfile({ children }: { children: React.ReactNode }) {
  const { user } = db.useAuth();
  const { isLoading, profile, error } = useProfile();

  useEffect(() => {
    if (!isLoading && !profile) {
      createProfile(user!.id);
    }
  }, [user, isLoading, profile]);

  if (isLoading) return null;
  if (error) return <div className="p-4 text-red-500">Profile error: {error.message}</div>;
  if (!profile) return null; // Still creating profile...

  return <>{children}</>;
}

// Use the room for presence and topics
const room = db.room("todos", "main");

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

  if (isLoading) { return; }
  if (error) { return <div className="text-red-500 p-4">Error: {error.message}</div>; }

  const loadNextPage = () => {
    setPageNumber(pageNumber + 1);
  };

  const loadPreviousPage = () => {
    setPageNumber(pageNumber - 1);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg p-6">
        <div className="flex justify-between items-start mb-6">
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
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={loadPreviousPage}
            disabled={pageNumber <= 1}
            className={`px-4 py-2 bg-gray-200 rounded ${pageNumber <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Previous
          </button>
          <button
            onClick={loadNextPage}
            disabled={posts.length < pageSize}
            className={`px-4 py-2 bg-gray-200 rounded ${posts.length < pageSize ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Next
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-4 text-center">
          {numUsers} user{numUsers > 1 ? 's' : ''} online
        </div>
      </div>
    </div>
  );
}

function ProfileAvatar() {
  const { user, profile } = useAuthAndProfile();
  const [isUploading, setIsUploading] = useState(false);
  const avatarPath = `${user!.id}/avatar`;

  const handleAvatarDelete = async () => {
    if (!profile.avatar) return;
    db.transact(db.tx.$files[lookup("path", avatarPath)].delete());
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data } = await db.storage.uploadFile(avatarPath, file);
      await db.transact(
        db.tx.profiles[profile.id].link({ avatar: data.id })
      );
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
            className="w-16 h-16 rounded-full object-cover border-2 border-gray-800"
          />
        ) : (
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-gray-800 font-bold text-xl border-2 border-gray-800">
            {profile.handle[0].toUpperCase()}
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
          className="text-gray-500 text-sm text-left hover:text-gray-700 disabled:text-gray-400"
          disabled={!profile.avatar || isUploading}>
          Delete Avatar
        </button>
      </div>
    </div>
  );
}



function PostForm() {
  const { user } = db.useAuth();
  const [value, setValue] = useState("");

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
    setValue("");
  };

  return (
    <div className="space-y-3">
      <input
        className="w-full px-4 py-3 border-2 border-gray-800 rounded-lg focus:outline-none focus:border-gray-600"
        autoFocus
        placeholder="What's on your mind?"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit('post')}
      />
      <div className="flex gap-3">
        <button
          className="px-6 py-2 bg-white border-2 border-gray-800 rounded-full hover:bg-gray-100 font-medium"
          onClick={() => handleSubmit('post')}
        >
          Add to wall
        </button>
        <button
          className="px-6 py-2 bg-white border-2 border-gray-800 rounded-full hover:bg-gray-100 font-medium"
          onClick={() => handleSubmit('shout')}
        >
          Shout to void
        </button>
      </div>
    </div>
  );
}

function PostList({ posts }: { posts: PostsWithProfile[] }) {
  const { user } = db.useAuth();
  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <div key={post.id} className="border-2 border-gray-800 rounded-lg p-4 bg-white">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-800 font-bold border-2 border-gray-800 flex-shrink-0">
              {post.author?.avatar ? (
                <img
                  className="w-full h-full rounded-full object-cover"
                  src={post.author.avatar.url}
                  alt={post.author.handle}
                />
              ) : (
                <span>{post.author?.handle[0].toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{post.author?.handle || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(post.createdAt).toLocaleString()}
                  </div>
                </div>
                {post.author?.id === user?.id && (
                  <button
                    onClick={() => deletePost(post.id)}
                    className="text-gray-400 hover:text-gray-600 text-sm"
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

function App() {
  return (
    <AuthGate>
      <EnsureProfile>
        <Main />
      </EnsureProfile>
    </AuthGate>
  );
}

export default App;
```

# Documentation

The bullets below are links to the InstantDB documentation. They provide
detailed information on how to use different features of InstantDB. Each line
follows the pattern of

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
- [Permissions](https://instantdb.com/docs/permissions.md): How to secure your data with Instant's Rule Language.
- [Managing users](https://instantdb.com/docs/users.md): How to manage users in your Instant app.
- [Presence, Cursors, and Activity](https://instantdb.com/docs/presence-and-topics.md): How to add ephemeral features like presence and cursors to your Instant app.
- [Instant CLI](https://instantdb.com/docs/cli.md): How to use the Instant CLI to manage schema and permissions.
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.
