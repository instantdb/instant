export type ReactorRole =
  | 'supervisor'
  | 'session'
  | 'network'
  | 'query'
  | 'mutation'
  | 'presence'
  | 'broadcast'
  | 'storage';

export interface RoleDescription {
  role: ReactorRole;
  responsibilities: string[];
}

export const roleDescriptions: RoleDescription[] = [
  {
    role: 'supervisor',
    responsibilities: [
      'Boot actor tree and wire dependencies between actors',
      'Derive public API state snapshots for consumers',
      'Coordinate restart semantics when a child reports a fatal error',
    ],
  },
  {
    role: 'session',
    responsibilities: [
      'Own authentication/session tokens',
      'Negotiate init/auth flows with backend',
      'Expose current connection status and identity to children',
    ],
  },
  {
    role: 'network',
    responsibilities: [
      'Drive websocket lifecycle and reconnect policy',
      'Serialize outbound messages coming from higher-level actors',
      'Emit inbound payloads as typed events to interested actors',
    ],
  },
  {
    role: 'query',
    responsibilities: [
      'Track active query subscriptions and callbacks',
      'Persist and hydrate cached query results',
      'Re-run instaql against optimistic stores on incoming updates',
    ],
  },
  {
    role: 'mutation',
    responsibilities: [
      'Manage pending mutation queue and optimistic updates',
      'Bridge transaction status notifications to callers',
      'Handle retries, timeouts, and reconciliation after reconnect',
    ],
  },
  {
    role: 'presence',
    responsibilities: [
      'Maintain room membership state',
      'Coalesce local presence writes and flush when the room connects',
      'Broadcast peer updates to listeners',
    ],
  },
  {
    role: 'broadcast',
    responsibilities: [
      'Fan-out cross-tab events through BroadcastChannel',
      'Deliver remote broadcast payloads from network actor to subscribers',
    ],
  },
  {
    role: 'storage',
    responsibilities: [
      'Provide persisted objects used by query and mutation actors',
      'Make it possible to stub out storage for deterministic tests',
    ],
  },
];
