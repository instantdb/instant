import { createInstantRouteHandlerBody } from '../index.ts';
import type {
  InstantRouteHandlerBody,
  InstantRouteHandlerPayloadByType,
  InstantRouteHandlerRawBody,
  InstantRouteHandlerType,
  User,
} from '../index.ts';
import type { Equal, Expect, NotAny } from './typeUtils.ts';

const user: User = {
  id: 'user-id',
  refresh_token: 'refresh-token',
  isGuest: false,
};

const syncUserBody = createInstantRouteHandlerBody('sync-user', {
  appId: 'app-id',
  user,
});

type _routeHandlerProtocolCases = [
  Expect<NotAny<typeof syncUserBody>>,
  Expect<Equal<typeof syncUserBody, InstantRouteHandlerBody<'sync-user'>>>,
  Expect<Equal<InstantRouteHandlerType, 'sync-user'>>,
  Expect<
    Equal<
      InstantRouteHandlerPayloadByType['sync-user'],
      { appId: string; user: User | null }
    >
  >,
];

const rawBody: InstantRouteHandlerRawBody = {
  type: 'future-type',
  appId: 'app-id',
  user: { anything: true },
  extra: true,
};

rawBody;

// @ts-expect-error unknown route handler types should not be constructible.
createInstantRouteHandlerBody('unknown-type', { appId: 'app-id', user });

createInstantRouteHandlerBody('sync-user', {
  appId: 'app-id',
  // @ts-expect-error sync-user bodies use the official User shape.
  user: { refresh_token: 'refresh-token' },
});
