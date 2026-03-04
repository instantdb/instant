export const features = [
  {
    title: 'Every interaction is instant',
    description:
      'There is no loading spinner, lag, or waiting. When you click a button, the app responds immediately.',
  },
  {
    title: 'Collaboration is enabled by default',
    description:
      "No need to pull to refresh. You can work together in real-time and see each other's changes instantly.",
  },
  {
    title: "Apps keep working even when you're offline",
    description:
      "You can keep using the app and your changes will sync when you come back online. Imagine using your favorite note-taking app and it doesn't load when your connection is spotty. That's not delightful.",
  },
];

export const layers = [
  {
    title: 'Optimistic Update Layer',
    why: 'Users want instant feedback. Without optimistic updates, every action waits for a server round trip.',
    description:
      'When a user clicks "Mark done" we first need to apply it to a local store so users can see the update immediately. We\'ll also need to track this as a pending mutation. That way we can rollback if the server rejects the mutation. If the server accepts, we clear it from the pending queue.',
    diagram: `User clicks "Mark done"
    │
    ▼
┌──────────────────┐     ┌──────────────┐
│ Mutation:        │────▶│ Local Store  │──▶ UI re-renders
│ todo.done = true │     │ (in-memory)  │    immediately
└────────┬─────────┘     └──────────────┘
         │
         ▼
┌──────────────────┐
│ Pending Mutations│
│ Queue            │
│ ┌──────────────┐ │
│ │ todo.done=T  │ │  ◀── track until
│ │ ts: 1709321  │ │      server confirms
│ └──────────────┘ │
└────────┬─────────┘
         │
    server rejects?
         │
         ▼
┌──────────────────┐
│ Rollback:        │
│ todo.done = false│──▶ UI re-renders again
└──────────────────┘`,
    highlights: [
      'todo.done = true',
      'todo.done=T',
      'UI re-renders',
      'UI re-renders again',
    ],
  },
  {
    title: 'Real-time Sync',
    why: "Users working together want to see each other's changes in real-time, not after a page refresh.",
    description:
      'We need to do polling or websockets. Websockets will be more-real time but then we need to handle disconnects and reconnects. When changes come in we need to merge remote updates into our local store. We also need to be mindful to not clobber any optimistic state.',
    diagram: `Client A marks a todo as done.
We send that to the server, which then broadcasts it to Client B.
Client B merges that change into their local store and updates the UI.

    ┌─ Client A ─────────┐      ┌─ Client B ─────────┐
│                    │      │                    │
│  Local Store       │      │  Local Store       │
│  ┌──────────────┐  │      │  ┌──────────────┐  │
│  │ todo.done: T │  │      │  │ todo.done: F │  │
│  └──────────────┘  │      │  └──────────────┘  │
│                    │      │                    │
│  WS Client ────────┼──┐┌──┼──── WS Client     │
└────────────────────┘  ││  └────────────────────┘
                        ▼▼
               ┌────────────────┐
               │  WS Server     │
               │                │
               │  subscriptions:│
               │  Client A:     │
               │   → todos.*    │
               │  Client B:     │
               │   → todos.*    │
               └───────┬────────┘
                       │
                  broadcast:
                  todo.done = T
                       │
                       ▼
              Client B receives,
              merges into local store,
              UI re-renders`,
    highlights: ['todo.done: T', 'todo.done = T', 'UI re-renders'],
  },
  {
    title: 'Offline Persistence',
    why: "Users wants to be able to use their apps even when offline. Spotty connections shouldn't mean lost work either.",
    description:
      "We need to persist every mutation to IndexedDB in case the user goes offline. When the user comes back, we replay their queued transactions in order. Any transactions that have already been acknowledged are removed so the store doesn't grow forever.",
    diagram: `User edits while offline
         │
         ▼
┌──────────────────┐     ┌─────────────────────┐
│ Mutation Queue   │────▶│ IndexedDB            │
│ (in-memory)      │     │                      │
└──────────────────┘     │ mutations table:     │
                         │ ┌───┬────────┬─────┐ │
                         │ │ id│ action │ ts  │ │
                         │ ├───┼────────┼─────┤ │
                         │ │ 1 │ update │ 170 │ │
                         │ │ 2 │ create │ 171 │ │
                         │ │ 3 │ delete │ 172 │ │
                         │ └───┴────────┴─────┘ │
                         └──────────┬────────────┘
                                    │
                           on reconnect:
                                    │
                         ┌──────────▼────────────┐
                         │ Replay engine          │
                         │ ├─ send #1 → ack ✓    │
                         │ ├─ send #2 → ack ✓    │
                         │ ├─ send #3 → ack ✓    │
                         │ └─ clear persisted     │
                         └────────────────────────┘`,
    highlights: ['ack ✓', 'on reconnect:'],
  },
  {
    title: 'Conflict Resolution',
    why: 'When you allow collaboration, you need handle what happens when two people edit the same thing at once.',
    description:
      'Client A and Client B both edit the same todo title at the same time. Who wins? We need a strategy to decide (for example last write wins). We also need to rollback clients who have inconsistent optimistic state.',
    diagram: `Client A (t=1)              Client B (t=2)
│                           │
│ title = "Buy milk"        │ title = "Buy eggs"
│                           │
▼                           ▼
┌───────────────────────────────────────┐
│            Server receives            │
│                                       │
│  mutation A: title="Buy milk"  t=1    │
│  mutation B: title="Buy eggs"  t=2    │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ Conflict detected:              │  │
│  │ same field, different values    │  │
│  │                                 │  │
│  │ Strategy?                       │  │
│  │ ├─ LWW: B wins (t=2 > t=1)      │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Result: title = "Buy eggs"           │
│                                       │
│  Broadcast to Client A:               │
│  "your optimistic state was wrong,    │
│   here's the real value"              │
└───────────────────────────────────────┘`,
    highlights: [
      'title = "Buy eggs"',
      'title="Buy eggs"',
      'LWW: B wins (t=2 > t=1)',
    ],
  },
];

export const hardClosing = [
  'This is a lot of code!',
  "Doing it by hand will probably take too long. Even if AI writes it, you'll need to maintain it for every feature you build.",
];
