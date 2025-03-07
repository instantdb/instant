import {
  i,
  InstaQLLifecycleState,
  InstaQLParams,
  InstaQLResponse,
  InstaQLResult,
} from '@instantdb/core';
import { init } from '@instantdb/react';

const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    drawings: i.entity({
      name: i.string(),
      state: i.json(),
    }),
    invites: i.entity({
      email: i.string().indexed(),
    }),
    teams: i.entity({
      name: i.string(),
    }),
  },
  links: {
    drawingsTeams: {
      forward: {
        on: 'drawings',
        has: 'one',
        label: 'team',
      },
      reverse: {
        on: 'teams',
        has: 'many',
        label: 'drawings',
      },
    },
    teamInvites: {
      reverse: {
        on: 'teams',
        has: 'many',
        label: 'invites',
      },
      forward: {
        on: 'invites',
        has: 'one',
        label: 'team',
      },
    },
    teamMembers: {
      forward: {
        on: 'teams',
        has: 'many',
        label: 'members',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'joinedTeams',
      },
    },
    teamCreators: {
      forward: {
        on: 'teams',
        has: 'one',
        label: 'creator',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'createdTeams',
      },
    },
  },
});

const db = init({ appId: '', schema });

const user = { id: 'a', email: 'foo@bar.com' };

export default function App() {
  const { isLoading, error, data } = db.useQuery({
    teams: {
      $: {
        where: {
          or: [{ member: user.id }, { creator: user.id }],
        },
      },
    },

    invites: {
      $: {
        where: {
          userEmail: user.email,
        },
      },
      team: {},
    },
  });
  data;
}

function q<Q extends InstaQLParams<typeof schema>>(q: Q) {
  return q;
}

const x = q({
  teams: {
    $: {
      where: {
        or: [{ member: user.id }, { creator: user.id }],
      },
    },
  },

  invites: {
    $: {
      where: {
        userEmail: user.email,
      },
    },
    team: {},
  },
});

type FooResult = InstaQLLifecycleState<typeof schema, typeof x>['data'];
