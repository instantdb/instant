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

/**
 * An untrusted request body before route handler validation.
 *
 * Use `InstantRouteHandlerBody` after checking the `type` and payload shape.
 */
export type InstantRouteHandlerRawBody = {
  type?: InstantRouteHandlerType | (string & {});
  appId?: string;
  user?: unknown;
  [key: string]: unknown;
};

/** Creates a typed request body for Instant's first-party route handler. */
export function createInstantRouteHandlerBody<
  Type extends InstantRouteHandlerType,
>(
  type: Type,
  payload: InstantRouteHandlerPayloadByType[Type],
): InstantRouteHandlerBody<Type> {
  return { type, ...payload } as InstantRouteHandlerBody<Type>;
}
