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
      "When a user makes a change we first apply it to a local store so users see the update immediately. We'll also need to track this as a pending mutation. That way we can rollback if the server rejects the mutation. If the server accepts, we clear the mutation from the pending queue.",
  },
  {
    title: 'Real-time Sync',
    why: "Users working together want to see each other's changes in real-time, not after a page refresh.",
    description:
      'We need to do polling or websockets. Websockets will be more-real time but then we need to handle disconnects and reconnects. When changes come in we need to merge remote updates into our local store.',
  },
  {
    title: 'Offline Persistence',
    why: "Users want to be able to use their apps even when offline. Spotty connections shouldn't mean lost work either.",
    description:
      "We need to persist queries and mutations to IndexedDB in case the user goes offline. When the user comes back, we replay their queued transactions in order. Any transactions that have already been acknowledged are removed so the store doesn't grow forever.",
  },
  {
    title: 'Conflict Resolution',
    why: 'When you allow collaboration, you need to handle what happens when two people edit the same thing at once.',
    description:
      'Alyssa and Louis both edit the same shape at the same time. Who wins? We need a strategy to decide (for example last write wins). We also need to rollback clients who have inconsistent optimistic state.',
  },
];

export const hardClosing = [
  'This is a lot of code!',
  "Doing it by hand will probably take too long. Even if AI writes it, you'll need to maintain it for every feature you build.",
];
