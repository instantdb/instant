import { ComponentType, SVGProps } from 'react';
import {
  CircleStackIcon,
  LockClosedIcon,
  ArrowPathIcon,
  FolderIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
} from '@heroicons/react/24/outline';

export type Product = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  codeExample: string;
  codeLanguage: string;
};

export const products: Product[] = [
  {
    id: 'database',
    name: 'Database',
    tagline: 'Query in the shape of your data',
    description:
      'Instant is built on top of Aurora Postgres. But you never write SQL. Instead you use InstaQL for queries and InstaML for transactions. InstaQL is a declarative query language that lets you write queries in the shape of your data. No nested SQL, no data manipulation in your application code. InstaML gives you a Firebase-like syntax with a few verbs for creating, updating, deleting, and linking data. Every transaction is atomic.',
    features: [
      'Declarative queries with InstaQL',
      'Firebase-like mutations with InstaML',
      'Built on Aurora Postgres',
      'Atomic transactions',
      'Relations and nested queries',
      'No SQL required',
    ],
    codeExample: `import { init, id } from "@instantdb/react";

const db = init({ appId: "my-app-id" });

function App() {
  // Read data with InstaQL
  const { data } = db.useQuery({
    posts: {
      comments: {},
      author: {},
    },
  });

  // Write data with InstaML
  const addPost = (title) => {
    db.transact(
      db.tx.posts[id()].update({ title, createdAt: Date.now() })
    );
  };

  return <Feed posts={data.posts} onAdd={addPost} />;
}`,
    codeLanguage: 'javascript',
  },
  {
    id: 'auth',
    name: 'Auth',
    tagline: 'Authentication that understands your data',
    description:
      'Instant comes with a built-in auth system. Add user accounts and social logins easily. Because auth is integrated with your database, you can create relations between users, their data, and permissions. Only allow users to see their own data, or let any member of a team view and edit shared data. Permissions use CEL, a powerful expression language originally developed by Google.',
    features: [
      'Magic codes and OAuth',
      'Integrated with your database',
      'CEL-based permissions',
      'Row-level security',
      'Easy to test and debug',
      'LLM-friendly permission syntax',
    ],
    codeExample: `// Send a magic code
db.auth.sendMagicCode({ email: "alyssa@example.com" });

// Verify and sign in
db.auth.signInWithMagicCode({ email, code });

// Or use Google OAuth
db.auth.signInWithRedirect({ clientName: "google" });

// Access the current user
const { user } = db.useAuth();

// Permissions in your schema
const rules = {
  todos: {
    allow: {
      view: "auth.id == data.ownerId",
      create: "auth.id != null",
    },
  },
};`,
    codeLanguage: 'javascript',
  },
  {
    id: 'sync-engine',
    name: 'Sync Engine',
    tagline: 'Optimistic updates, multiplayer, and offline mode',
    description:
      'The best apps are powered by sync engines. Figma, Notion, and Linear all feel instant because every interaction is optimistic, collaboration is default, and they work offline. Instant gives you these features for free whenever you use useQuery and transact. No additional code required. We use a last-write-wins strategy, broadcast updates via WebSockets, and persist transactions locally for offline support.',
    features: [
      'Optimistic updates by default',
      'Real-time multiplayer',
      'Offline support with local persistence',
      'Automatic conflict resolution',
      'WebSocket-based sync',
      'No extra code required',
    ],
    codeExample: `// That's it. useQuery and transact give you
// optimistic updates, multiplayer, and offline
// support out of the box.

function TodoList() {
  const { isLoading, data } = db.useQuery({
    todos: { owner: {} },
  });

  const toggle = (todo) => {
    // Updates instantly, syncs in background,
    // works offline, multiplayer-ready
    db.transact(
      db.tx.todos[todo.id].update({
        done: !todo.done,
      })
    );
  };

  return <List todos={data.todos} onToggle={toggle} />;
}`,
    codeLanguage: 'javascript',
  },
  {
    id: 'storage',
    name: 'Storage',
    tagline: 'File uploads connected to your data',
    description:
      'Instant comes with built-in file storage. Upload files and link them to your data in the database. No separate storage service needed. Because storage is integrated with the database, you can create relations between uploads and data. Use the same permissions system to control access to files. Build features like profile pictures or photo-sharing apps with ease.',
    features: [
      'Built-in file uploads',
      'Linked to your database',
      'Same permissions as your data',
      'No separate service needed',
      'Easy image and file handling',
      'Integrated with queries',
    ],
    codeExample: `// Upload a file
const url = await db.storage.uploadFile(
  "photos/avatar.png",
  file
);

// Link it to your data
db.transact(
  db.tx.profiles[id()].update({
    avatarUrl: url,
    userId: user.id,
  })
);

// Query files alongside your data
const { data } = db.useQuery({
  profiles: { $: { where: { userId: user.id } } },
});`,
    codeLanguage: 'javascript',
  },
  {
    id: 'admin-sdk',
    name: 'Admin SDK',
    tagline: 'Use Instant on your backend',
    description:
      'The Admin SDK lets you use Instant on your backend with elevated permissions. It operates over an HTTP API and provides the same InstaQL and InstaML APIs you use on the client. Use it for crons, scripts, data migrations, server-side rendering, and integrating with third-party APIs like Stripe.',
    features: [
      'Same InstaQL and InstaML APIs',
      'Elevated permissions',
      'HTTP API for any language',
      'JavaScript SDK included',
      'Great for crons and migrations',
      'Third-party API integration',
    ],
    codeExample: `import Instant from "@instantdb/admin";

const db = Instant({
  appId: process.env.INSTANT_APP_ID,
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

// Same query API, elevated permissions
const { data } = await db.query({
  users: { profile: {} },
});

// Run transactions server-side
await db.transact(
  db.tx.users[userId].update({ role: "admin" })
);

// Use in API routes, crons, migrations
export async function handler(req, res) {
  const orders = await db.query({ orders: {} });
  await syncToStripe(orders.data);
}`,
    codeLanguage: 'javascript',
  },
  {
    id: 'platform-api',
    name: 'Platform API',
    tagline: 'A backend for every chat',
    description:
      'Instant offers a platform API that lets you programmatically spin up databases. Give every chat its own backend, build app-builders, or let every employee create internal tools. When you combine a multi-tenant database with a platform SDK, you get infrastructure that lets agents and humans create backends on the fly.',
    features: [
      'Spin up databases in < 100ms',
      'Programmatic app creation',
      'Multi-tenant by design',
      'Perfect for AI agents',
      'Build app-builders',
      'Enable personal software',
    ],
    codeExample: `import { Platform } from "@instantdb/platform";

const platform = Platform({
  apiToken: process.env.PLATFORM_TOKEN,
});

// Spin up a new database in < 100ms
const app = await platform.apps.create({
  title: "Agent Chat #42",
});

// Each agent gets its own backend
const db = init({ appId: app.id });

// Define schema programmatically
await platform.apps.updateSchema(app.id, {
  entities: {
    messages: { attrs: { text: "string" } },
  },
});`,
    codeLanguage: 'javascript',
  },
];

export const productIcons: Record<
  string,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  database: CircleStackIcon,
  auth: LockClosedIcon,
  'sync-engine': ArrowPathIcon,
  storage: FolderIcon,
  'admin-sdk': CodeBracketIcon,
  'platform-api': CubeTransparentIcon,
};
