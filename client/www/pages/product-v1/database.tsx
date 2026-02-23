import { ProductPage } from '@/components/productPageUi';
import {
  CircleStackIcon,
  BoltIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

export default function Database() {
  return (
    <ProductPage
      slug="database"
      name="Database"
      description="Instant is built on top of Aurora Postgres. But you never write SQL. Instead you use InstaQL for queries and InstaML for transactions. InstaQL is a declarative query language that lets you write queries in the shape of your data. No nested SQL, no data manipulation in your application code. InstaML gives you a Firebase-like syntax with a few verbs for creating, updating, deleting, and linking data. Every transaction is atomic."
      headline="A database that speaks your language"
      codeExample={`import { init, id } from "@instantdb/react";

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
}`}
      sectionHeading="Everything you need to work with your data"
      tabs={[
        {
          heading: 'Queries that match the shape of your data',
          description:
            'With InstaQL, you describe the data you want and Instant figures out the rest. No SQL joins, no data manipulation in your app code. Queries are declarative, composable, and always return nested results.',
          code: `// Fetch posts with their comments and authors
const { data } = db.useQuery({
  posts: {
    comments: { author: {} },
    tags: {},
  },
});

// Queries match the shape of your data
// No SQL joins, no data manipulation`,
        },
        {
          heading: 'Firebase-like mutations with atomic transactions',
          description:
            'InstaML gives you a small set of verbs for creating, updating, deleting, and linking data. Every transaction is atomic. Updates are optimistic and sync in the background.',
          code: `// Create, update, delete, and link
db.transact([
  db.tx.posts[id()].update({
    title: "Hello World",
    createdAt: Date.now(),
  }),
  db.tx.posts[postId].link({
    tags: tagId,
  }),
]);`,
        },
        {
          heading: 'Define your data model with a typed schema',
          description:
            'Relations let you connect entities together. Define them once in your schema and use them everywhere in your queries. Instant handles the foreign keys and join tables for you.',
          code: `// Define relations in your schema
const schema = i.schema({
  entities: {
    posts: i.entity({ title: i.string() }),
    comments: i.entity({ body: i.string() }),
  },
  links: [
    { from: "posts", to: "comments", has: "many" },
  ],
});`,
        },
      ]}
      featureCards={[
        {
          icon: CircleStackIcon,
          title: 'Built on Aurora Postgres',
          description:
            'Your data is stored in Aurora Postgres. You get the reliability and performance of a battle-tested database without writing any SQL.',
        },
        {
          icon: BoltIcon,
          title: 'Optimistic by default',
          description:
            'Every mutation updates the UI instantly. Changes sync in the background with automatic conflict resolution.',
        },
        {
          icon: SignalIcon,
          title: 'Real-time and offline',
          description:
            'Queries are reactive. Updates stream to all connected clients via WebSockets. Local persistence enables offline support.',
        },
      ]}
    />
  );
}
