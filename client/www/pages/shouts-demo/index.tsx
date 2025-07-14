'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  id,
  lookup,
  InstaQLEntity,
  User,
  i,
  InstantReactWebDatabase,
} from '@instantdb/react';

import { init } from '@instantdb/react';
import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';

const schema = i.schema({
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
      forward: { on: 'posts', has: 'one', label: 'author', required: true },
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

// Instant utility types for query results
type ProfileWithAvatar = InstaQLEntity<
  typeof schema,
  'profiles',
  { avatar: {} }
>;
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

type DB = InstantReactWebDatabase<typeof schema>;

// Write Data
// ---------
async function createProfile(db: DB, userId: string) {
  // IMPORTANT: transact is how you write data to the database
  // We want to block until the profile is created, so we use await
  await db.transact(
    db.tx.profiles[userId]
      .update({
        handle: randomHandle(),
      })
      .link({ user: userId }),
  );
}

function addPost(db: DB, text: string, authorId: string | undefined) {
  db.transact(
    // IMPORTANT: ids must be a valid UUID, so we use `id()` to generate one
    db.tx.posts[id()]
      .update({
        text,
        createdAt: Date.now(),
      })
      .link({ author: authorId }),
  );
}

function deletePost(db: DB, postId: string) {
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

function addShout(
  db: DB,
  {
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
  },
) {
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
function useProfile(db: DB) {
  const { user } = db.useAuth();
  if (!user) {
    throw new Error('useProfile must be used after auth');
  }
  const { data, isLoading, error } = db.useQuery({
    profiles: {
      $: { where: { 'user.id': user.id } },
      avatar: {},
    },
  });
  const profile = data?.profiles?.[0];

  return { profile, isLoading, error };
}

function useAuthAndProfile(db: DB): { user: User; profile: ProfileWithAvatar } {
  const { user } = db.useAuth();
  const { profile } = useProfile(db);
  if (!user || !profile) {
    throw new Error(
      'useAuthAndProfile must be used after auth and profile are loaded',
    );
  }
  return { user, profile };
}

function usePosts(db: DB, pageNumber: number, pageSize: number) {
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
function AuthGate({ db, children }: { db: DB; children: React.ReactNode }) {
  const { user, isLoading, error } = db.useAuth();

  if (isLoading) return null;
  if (error)
    return <div className="p-4 text-red-500">Auth error: {error.message}</div>;
  if (!user) return <Login db={db} />;

  return <>{children}</>;
}

function Login({ db }: { db: DB }) {
  const [sentEmail, setSentEmail] = useState('');

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="max-w-sm">
        {!sentEmail ? (
          <EmailStep db={db} onSendEmail={setSentEmail} />
        ) : (
          <CodeStep db={db} sentEmail={sentEmail} />
        )}
      </div>
    </div>
  );
}

function EmailStep({
  db,
  onSendEmail,
}: {
  db: DB;
  onSendEmail: (email: string) => void;
}) {
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
      <ul className="list-disc pl-5 space-y-1">
        <li>Initiailizes a connection to InstantDB</li>
        <li>Defines schema and permissions for the app</li>
        <li>Authentication with magic codes</li>
        <li>Reads and writes data via `db.useQuery` and `db.transact`</li>
        <li>Ephemeral features like who's online</li>
        <li>File uploads for avatars</li>
      </ul>

      <p className="text-gray-700">
        To try the app, enter your email, and we'll send you a verification
        code. We'll create an account for you too if you don't already have one.
      </p>
      <input
        ref={inputRef}
        type="email"
        className="border border-gray-300 px-3 py-1  w-full"
        placeholder="Enter your email"
        required
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

function CodeStep({ db, sentEmail }: { db: DB; sentEmail: string }) {
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
        className="border border-gray-300 px-3 py-1  w-full"
        placeholder="123456..."
        required
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

function EnsureProfile({
  db,
  children,
}: {
  db: DB;
  children: React.ReactNode;
}) {
  const { user } = db.useAuth();
  const { isLoading, profile, error } = useProfile(db);

  useEffect(() => {
    if (!isLoading && !profile) {
      createProfile(db, user!.id);
    }
  }, [user, isLoading, profile]);

  if (isLoading) return null;
  if (error)
    return (
      <div className="p-4 text-red-500">Profile error: {error.message}</div>
    );
  if (!profile) return null; // Still creating profile...

  return <>{children}</>;
}

// App Components
// ---------
function Main({ db }: { db: DB }) {
  // Use the room for presence and topics
  const room = db.room('todos', 'main');

  const [pageNumber, setPageNumber] = useState(1);
  const pageSize = 5;
  const { isLoading, error, posts } = usePosts(db, pageNumber, pageSize);

  const { peers } = db.rooms.usePresence(room);
  const numUsers = 1 + Object.keys(peers).length;

  db.rooms.useTopicEffect(room, 'shout', (message) => {
    addShout(db, message);
  });

  if (isLoading) {
    return;
  }
  if (error) {
    return <div className="text-red-500 p-4">Error: {error.message}</div>;
  }

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
          <ProfileAvatar db={db} />
          <button
            onClick={() => db.auth.signOut()}
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            Sign out
          </button>
        </div>

        <div className="mb-6">
          <PostForm db={db} />
        </div>

        <div className="space-y-4">
          <PostList db={db} posts={posts} />
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

function ProfileAvatar({ db }: { db: DB }) {
  const { user, profile } = useAuthAndProfile(db);
  const [isUploading, setIsUploading] = useState(false);
  const avatarPath = `${user!.id}/avatar`;

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
          disabled={!profile.avatar || isUploading}
        >
          Delete Avatar
        </button>
      </div>
    </div>
  );
}

function PostForm({ db }: { db: DB }) {
  // Use the room for presence and topics
  const room = db.room('todos', 'main');

  const { user } = db.useAuth();
  const [value, setValue] = useState('');

  const publishShout = db.rooms.usePublishTopic(room, 'shout');

  const handleSubmit = (action: string) => {
    if (!value.trim()) return;

    if (action === 'post') {
      addPost(db, value, user?.id);
    } else {
      const params = makeShout(value);
      addShout(db, params);
      publishShout(params);
    }
    setValue('');
  };

  return (
    <div className="space-y-3">
      <input
        className="w-full px-4 py-3 border-2 border-gray-800 rounded-lg focus:outline-none focus:border-gray-600"
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

function PostList({ db, posts }: { db: DB; posts: PostsWithProfile[] }) {
  const { user } = db.useAuth();
  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <div
          key={post.id}
          className="border-2 border-gray-800 rounded-lg p-4 bg-white"
        >
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
                  <div className="font-medium">
                    {post.author?.handle || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(post.createdAt).toLocaleString()}
                  </div>
                </div>
                {post.author?.id === user?.id && (
                  <button
                    onClick={() => deletePost(db, post.id)}
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
  const router = useReadyRouter();
  const appId = router.query.a as string;
  const isLocal = router.query.localBackend === '1';
  const dbRef = useRef<DB | null>(
    appId
      ? init({
          appId,
          schema,
          ...(isLocal
            ? {
                apiURI: 'http://localhost:8888',
                websocketURI: 'ws://localhost:8888/runtime/session',
              }
            : {}),
        })
      : null,
  );

  if (!dbRef.current) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        You loaded this screen without an appId.
      </div>
    );
  }

  const db = dbRef.current;

  return (
    <AuthGate db={db}>
      <EnsureProfile db={db}>
        <Main db={db} />
      </EnsureProfile>
    </AuthGate>
  );
}

export default asClientOnlyPage(App);
