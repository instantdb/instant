import type { User } from './clientTypes.ts';

/**
 * Known payloads sent to `firstPartyPath` and handled by
 * `createInstantRouteHandler`.
 */
export type InstantRouteHandlerPayloadByType = {
  'sync-user': {
    appId: string;
    user: User | null;
  };
};

/** Known `type` values for Instant route handler request bodies. */
export type InstantRouteHandlerType = keyof InstantRouteHandlerPayloadByType;

/** A valid request body for Instant's first-party route handler protocol. */
export type InstantRouteHandlerBody<
  Type extends InstantRouteHandlerType = InstantRouteHandlerType,
> = {
  [KnownType in Type]: {
    type: KnownType;
  } & InstantRouteHandlerPayloadByType[KnownType];
}[Type];
