import { ProductPage } from '@/components/productPageUi';

export default function SyncEngine() {
  return (
    <ProductPage
      slug="sync-engine"
      name="Sync Engine"
      description="The best apps are powered by sync engines. Figma, Notion, and Linear all feel instant because every interaction is optimistic, collaboration is default, and they work offline. Instant gives you these features for free whenever you use useQuery and transact. No additional code required. We use a last-write-wins strategy, broadcast updates via WebSockets, and persist transactions locally for offline support."
      headline="The sync engine your app deserves"
      codeExample={`// That's it. useQuery and transact give you
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
}`}
      sectionHeading="Optimistic, multiplayer, and offline by default"
      tabs={[
        {
          heading: 'Every interaction feels instant',
          description:
            'When you call transact, the UI updates immediately. The change syncs to the server in the background. If something goes wrong, Instant rolls back gracefully. No loading spinners after every click.',
          code: `function TodoList() {
  const { data } = db.useQuery({
    todos: { owner: {} },
  });

  const toggle = (todo) => {
    // UI updates instantly
    // Syncs in the background
    // Rolls back on failure
    db.transact(
      db.tx.todos[todo.id].update({
        done: !todo.done,
      })
    );
  };

  return <List todos={data.todos} onToggle={toggle} />;
}`,
        },
        {
          heading: 'Real-time collaboration for free',
          description:
            'Every query is a live subscription. When one user makes a change, all connected clients see it instantly via WebSockets. Build collaborative apps like Figma or Notion without any extra code.',
          code: `// User A creates a comment
db.transact(
  db.tx.comments[id()].update({
    text: "Looks great!",
    postId: postId,
  })
);

// User B sees it instantly
// No polling, no refetching
const { data } = db.useQuery({
  posts: {
    comments: {},
  },
});
// data.posts[0].comments updates
// in real-time for all users`,
        },
        {
          heading: 'Works without a connection',
          description:
            'Instant persists queries and pending transactions locally. When the user goes offline, they can keep reading and writing. When the connection is re-established, everything syncs automatically.',
          code: `// Works the same offline
const { data } = db.useQuery({
  todos: {},
});

// Transactions queue locally
db.transact(
  db.tx.todos[id()].update({
    text: "Buy groceries",
  })
);

// When back online:
// 1. Pending transactions sync
// 2. Server confirms or resolves conflicts
// 3. UI updates seamlessly`,
        },
      ]}
    />
  );
}
