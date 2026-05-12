import {
  InstantAPIError,
  InstantError,
  InstantSchemaDef,
  InstantUnknownSchema,
  ResolveAttrs,
  version as coreVersion,
} from '@instantdb/core';

type Config<Schema extends InstantSchemaDef<any, any, any>> = {
  appId?: string | null | undefined;
  adminToken?: string | null | undefined;
  token?: string | null | undefined;
  apiURI?: string | null | undefined;
  schema?: Schema | null | undefined;
  /**
   * Optional hook used by {@link WebhooksManager} to obtain the bearer token
   * for each management request. Lets callers (e.g. the platform SDK) wrap
   * the operation in token-refresh / retry logic.
   *
   * If omitted, the manager uses the static `adminToken`/`token` from this
   * config.
   */
  withAuth?: WithAuth;
};

type JsonFetch = (
  input: RequestInfo,
  init?: RequestInit | undefined,
) => Promise<any>;

/**
 * Runs a webhook management operation that needs a bearer token. The runner
 * is responsible for supplying the token, and may retry the operation with a
 * fresh token if the first attempt fails with an auth error.
 */
export type WithAuth = <T>(
  operation: (token: string) => Promise<T>,
) => Promise<T>;

export type WebhookBody = {
  payloadUrl: string;
  token: string;
};

export type WebhookEntity<
  Schema extends InstantSchemaDef<any, any, any>,
  EtypeName extends keyof Schema['entities'],
> = { id: string } & ResolveAttrs<Schema['entities'], EtypeName, false>;

export type WebhookPayloadRecord<
  Schema extends InstantSchemaDef<any, any, any>,
> = {
  [EtypeName in keyof Schema['entities']]:
    | {
        etype: EtypeName;
        id: string;
        action: 'create';
        before: null;
        after: WebhookEntity<Schema, EtypeName>;
        idempotencyKey: string;
      }
    | {
        etype: EtypeName;
        id: string;
        action: 'update';
        before: WebhookEntity<Schema, EtypeName>;
        after: WebhookEntity<Schema, EtypeName>;
        idempotencyKey: string;
      }
    | {
        etype: EtypeName;
        id: string;
        action: 'delete';
        before: WebhookEntity<Schema, EtypeName>;
        after: null;
        idempotencyKey: string;
      };
}[keyof Schema['entities']];

export type WebhookPayload<Schema extends InstantSchemaDef<any, any, any>> = {
  data: WebhookPayloadRecord<Schema>[];
  idempotencyKey: string;
};

export type WebhookAction = 'create' | 'update' | 'delete';

/**
 * Whether Instant will currently deliver events for a webhook.
 * `disabled` webhooks remain configured but no new events are queued.
 */
export type WebhookStatus = 'active' | 'disabled';

/**
 * Stage in the delivery lifecycle of a single webhook event.
 *
 * - `pending`: queued, not yet picked up for delivery
 * - `processing`: a sender is actively attempting delivery
 * - `success`: the receiver acknowledged with a 2xx response
 * - `error`: an attempt failed; another retry is scheduled
 * - `failed`: all retries exhausted; will not be retried automatically
 *   (use {@link WebhooksManager.resendEvent} to retry manually)
 */
export type WebhookEventStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'error'
  | 'failed';

export type WebhookInfo = {
  /** Unique identifier for the webhook. */
  id: string;
  /** Where Instant POSTs event payloads to. */
  sink: {
    /** HTTPS endpoint that Instant POSTs to. */
    url: string;
  };
  /** The entity types (namespaces) this webhook listens to. */
  etypes: string[];
  /** Which write actions trigger delivery. */
  actions: WebhookAction[];
  /** Whether the webhook is currently delivering events. */
  status: WebhookStatus;
  /**
   * Human-readable reason the webhook is disabled. Set automatically when
   * Instant disables the webhook (e.g. after repeated delivery failures) or
   * supplied by the caller via {@link WebhooksManager.disable}. `null` when
   * `status` is `'active'`.
   */
  disabledReason: string | null;
  /** When the webhook was created. */
  createdAt: Date;
  /** When the webhook's config was last changed. */
  updatedAt: Date;
};

/**
 * Record of a single HTTP delivery attempt for a webhook event.
 * Stored in attempt order (oldest first) on the event's `attempts` array.
 */
export type WebhookAttempt = {
  /** When the attempt started. */
  attemptAt: Date | null;
  /** Time from request start to response received (or error), in milliseconds. */
  durationMs: number | null;
  /** `true` if the receiver returned a 2xx response. */
  success: boolean | null;
  /** HTTP status code returned by the receiver, if a response was received. */
  statusCode: number | null;
  /**
   * First 256 bytes of the response body, for debugging. `null` if no
   * response was received (e.g. on a network error).
   */
  responseText: string | null;
  /**
   * Short tag classifying a delivery failure. One of `timeout`, `dns`,
   * `connect`, `tls`, `protocol`, `network`, or `unknown`. `null` on success.
   */
  errorType: string | null;
  /** Free-form description of the failure. `null` on success. */
  errorMessage: string | null;
};

export type WebhookEventInfo = {
  /**
   * Instant Sequence Number — a stable, totally ordered identifier for the
   * event.
   */
  isn: string;
  /** Current stage in the delivery lifecycle. */
  status: WebhookEventStatus;
  /**
   * Per-attempt records, in attempt order (oldest first). `null` if the
   * event has not been attempted yet.
   */
  attempts: WebhookAttempt[] | null;
  /**
   * The next retry will not happen before this time. `null` once the event
   * reaches a terminal status (`success` or `failed`).
   */
  nextAttemptAfter: Date | null;
  /** When the event was queued. */
  createdAt: Date;
  /** When the event last transitioned status. */
  updatedAt: Date;
};

export type WebhookEventsPage = {
  /** The events on this page, newest first. */
  events: WebhookEventInfo[];
  pageInfo: {
    /** Cursor pointing to the first event on this page. */
    startCursor: string | null;
    /**
     * Cursor pointing to the last event on this page. Pass as
     * {@link WebhooksManager.listEvents}'s `after` option to fetch the next page.
     */
    endCursor: string | null;
    /** Whether more events are available after `endCursor`. */
    hasNextPage: boolean;
  };
};

export type CreateWebhookParams<
  Schema extends InstantSchemaDef<any, any, any>,
> = {
  /**
   * HTTPS endpoint Instant will POST events to. Must use the `https` scheme
   * and resolve to a public host.
   */
  url: string;
  /**
   * Entity types (namespaces) the webhook will listen to. Must reference at
   * least one entity in the app's schema.
   */
  etypes: (keyof Schema['entities'] & string)[];
  /** Write actions that should trigger delivery. Must contain at least one. */
  actions: WebhookAction[];
};

export type UpdateWebhookParams<
  Schema extends InstantSchemaDef<any, any, any>,
> = {
  /** New delivery URL. Omit to leave unchanged. */
  url?: string;
  /** New set of entity types. Omit to leave unchanged. */
  etypes?: (keyof Schema['entities'] & string)[];
  /** New set of actions. Omit to leave unchanged. */
  actions?: WebhookAction[];
};

export type WebhookPayloadRecordFor<
  Schema extends InstantSchemaDef<any, any, any>,
  EtypeName extends keyof Schema['entities'],
  Action extends WebhookAction,
> = Extract<WebhookPayloadRecord<Schema>, { etype: EtypeName; action: Action }>;

export type WebhookHandlerFn<
  Schema extends InstantSchemaDef<any, any, any>,
  EtypeName extends keyof Schema['entities'],
  Action extends WebhookAction,
  Result = any,
> = (
  record: WebhookPayloadRecordFor<Schema, EtypeName, Action>,
) => Result | Promise<Result>;

export type DefaultKey = '$default';

export type ResolveHandlerAction<Action> = Action extends DefaultKey
  ? WebhookAction
  : Action extends WebhookAction
    ? Action
    : never;

export type WebhookHandlers<Schema extends InstantSchemaDef<any, any, any>> = {
  [EtypeName in keyof Schema['entities']]?: {
    [Action in WebhookAction | DefaultKey]?: WebhookHandlerFn<
      Schema,
      EtypeName,
      ResolveHandlerAction<Action>,
      any
    >;
  };
} & {
  $default?: WebhookHandlerFn<
    Schema,
    keyof Schema['entities'],
    WebhookAction,
    any
  >;
};

export type TypedHandlerEntry<
  Schema extends InstantSchemaDef<any, any, any>,
  EtypeName extends keyof Schema['entities'],
  Action extends WebhookAction | DefaultKey,
> = {
  [E in EtypeName]: {
    [A in Action]: WebhookHandlerFn<
      Schema,
      EtypeName,
      ResolveHandlerAction<Action>,
      any
    >;
  };
};

export type TypedDefaultEntry<Schema extends InstantSchemaDef<any, any, any>> =
  {
    $default: WebhookHandlerFn<
      Schema,
      keyof Schema['entities'],
      WebhookAction,
      any
    >;
  };

export type WebhookHelpers<Schema extends InstantSchemaDef<any, any, any>> = {
  typedHandlers: {
    (
      etype: DefaultKey,
      handler: WebhookHandlerFn<
        Schema,
        keyof Schema['entities'],
        WebhookAction,
        any
      >,
    ): TypedDefaultEntry<Schema>;
    <
      EtypeName extends keyof Schema['entities'],
      Action extends WebhookAction | DefaultKey,
    >(
      etype: EtypeName,
      action: Action,
      handler: WebhookHandlerFn<
        Schema,
        EtypeName,
        ResolveHandlerAction<Action>,
        any
      >,
    ): TypedHandlerEntry<Schema, EtypeName, Action>;
  };
  combineHandlers: (
    ...entries: Array<WebhookHandlers<Schema>>
  ) => WebhookHandlers<Schema>;
};

const knownKeys = {
  'https://api.instantdb.com': {
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        alg: 'EdDSA',
        use: 'sig',
        kid: '1034696293',
        x: 'N-C41432STKAKkXAWmeIOXMnZcGRR1b9u1L3bTVqI_o',
      },
    ],
  },
  'http://localhost:8888': {
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        alg: 'EdDSA',
        use: 'sig',
        kid: '503090235',
        x: 'qrSkwDaMITRMF9nOgpueqxgaAiuFmJperYE3mkyl8Ow',
      },
    ],
  },
};

type ImportAlgorithm =
  | AlgorithmIdentifier
  | RsaHashedImportParams
  | EcKeyImportParams;

function inferWebCryptoAlg(jwk: any): ImportAlgorithm {
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return { name: 'Ed25519' };
  }

  if (jwk.kty === 'EC') {
    return { name: 'ECDSA', namedCurve: jwk.crv }; // e.g., P-256, P-384
  }

  if (jwk.kty === 'RSA') {
    // RSA keys often specify the exact hash in the 'alg' field (e.g., RS256)
    const hashMap: Record<string, string> = {
      RS256: 'SHA-256',
      RS384: 'SHA-384',
      RS512: 'SHA-512',
    };
    return {
      name: 'RSASSA-PKCS1-v1_5',
      hash: hashMap[jwk.alg] || 'SHA-256',
    };
  }

  throw new Error(
    `Unsupported JWK configuration: kty=${jwk.kty}, crv=${jwk.crv}`,
  );
}

async function importKey(
  jwk: any,
): Promise<{ alg: ImportAlgorithm; key: CryptoKey }> {
  const alg = inferWebCryptoAlg(jwk);
  const key = await crypto.subtle.importKey('jwk', jwk, alg, false, ['verify']);
  return { alg, key };
}

function verify(
  alg: ImportAlgorithm,
  key: CryptoKey,
  signature: BufferSource,
  message: BufferSource,
): Promise<boolean> {
  return crypto.subtle.verify(
    alg as AlgorithmIdentifier,
    key,
    signature,
    message,
  );
}

function hexToUint8Array(hexString: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function parseSignatureHeader(h: string): {
  t: string;
  kid: string;
  v1: string;
} {
  let t: string | undefined, kid: string | undefined, v1: string | undefined;
  for (const part of h.split(',')) {
    const [k, v] = part.split('=');
    switch (k) {
      case 't': {
        t = v;
        break;
      }
      case 'kid': {
        kid = v;
        break;
      }
      case 'v1': {
        v1 = v;
        break;
      }
    }
  }

  const missingKeys: string[] = [];
  if (!t) {
    missingKeys.push('t');
  }
  if (!kid) {
    missingKeys.push('kid');
  }
  if (!v1) {
    missingKeys.push('v1');
  }

  if (missingKeys.length || !t || !kid || !v1) {
    throw new InstantError('Invalid Instant-Signature header.', {
      header: h,
      missingKeys,
    });
  }

  return { t, kid, v1 };
}

function validateT(receivedAt: Date, t: string, tolerance: number): void {
  const age = Math.floor(receivedAt.getTime() / 1000) - parseInt(t, 10);
  if (age > tolerance) {
    throw new InstantError('Webhook signature is too old', {
      tolerance,
      receivedAt,
      t,
    });
  }
}

// We make this a global cache so that it will survive across
// restarts. It will only store valid signing keys from instant, and we don't
// create many of them, so the memory usage will be only 1 or 2 keys.
const keyCache: Record<string, { alg: ImportAlgorithm; key: CryptoKey }> = {};
const defaultTolerance = 300; // 5 minutes

async function jsonReject(
  rejectFn: (err: InstantAPIError) => any,
  res: Response,
) {
  const body = await res.text();
  try {
    const json = JSON.parse(body);
    return rejectFn(new InstantAPIError({ status: res.status, body: json }));
  } catch (_e) {
    return rejectFn(
      new InstantAPIError({
        status: res.status,
        body: { type: undefined, message: body },
      }),
    );
  }
}

const defaultJsonFetch: JsonFetch = async (input, init) => {
  const headers = {
    ...(init?.headers || {}),
    'Instant-Core-Version': coreVersion,
  };
  const res = await fetch(input, { ...init, headers });
  if (res.status === 200) {
    return res.json();
  }
  return jsonReject((x) => Promise.reject(x), res);
};

function parseDate(s: string | null | undefined): Date | null {
  return s ? new Date(s) : null;
}

function toWebhookInfo(raw: any): WebhookInfo {
  return {
    id: raw.id,
    sink: raw.sink,
    etypes: raw.etypes ?? [],
    actions: raw.actions,
    status: raw.status,
    disabledReason: raw.disabled_reason ?? null,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

function toWebhookAttempt(raw: any): WebhookAttempt {
  return {
    attemptAt: parseDate(raw['attempt-at']),
    durationMs: raw['duration-ms'] ?? null,
    success: raw['success?'] ?? null,
    statusCode: raw['status-code'] ?? null,
    responseText: raw['response-text'] ?? null,
    errorType: raw['error-type'] ?? null,
    errorMessage: raw['error-message'] ?? null,
  };
}

function toWebhookEventInfo(raw: any): WebhookEventInfo {
  return {
    isn: raw.isn,
    status: raw.status,
    attempts: raw.attempts ? raw.attempts.map(toWebhookAttempt) : null,
    nextAttemptAfter: parseDate(raw.next_attempt_after),
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

export class WebhooksManager<Schema extends InstantSchemaDef<any, any, any>> {
  #appId: string | null | undefined;
  #apiURI: string;
  #token: string | null | undefined;
  #withAuth: WithAuth | undefined;
  #jsonFetch: JsonFetch;

  constructor(opts: {
    appId: string | null | undefined;
    apiURI: string;
    token: string | null | undefined;
    withAuth?: WithAuth;
    jsonFetch: JsonFetch;
  }) {
    this.#appId = opts.appId;
    this.#apiURI = opts.apiURI;
    this.#token = opts.token;
    this.#withAuth = opts.withAuth;
    this.#jsonFetch = opts.jsonFetch;
  }

  #authedFetch(
    path: string,
    opts?: { method?: string; body?: unknown },
  ): Promise<any> {
    if (!this.#appId) {
      throw new InstantError(
        'appId is required to manage webhooks. Pass it to the Webhooks constructor.',
      );
    }
    const run = (token: string) => {
      const init: RequestInit = {
        method: opts?.method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      };
      if (opts?.body !== undefined) {
        init.body = JSON.stringify(opts.body);
      }
      return this.#jsonFetch(`${this.#apiURI}${path}`, init);
    };
    if (this.#withAuth) {
      return this.#withAuth(run);
    }
    if (!this.#token) {
      throw new InstantError(
        'A token is required to manage webhooks. Pass `adminToken` or `token` to the Webhooks constructor.',
      );
    }
    return run(this.#token);
  }

  /**
   * Returns every webhook configured on the app, newest first. Includes both
   * active and disabled webhooks.
   */
  async list(): Promise<WebhookInfo[]> {
    const res = await this.#authedFetch(`/dash/apps/${this.#appId}/webhooks`);
    return (res.webhooks || []).map(toWebhookInfo);
  }

  /**
   * Creates a new webhook. The webhook is created in the `active` state and
   * starts receiving matching events immediately.
   *
   * The server rejects the request if `url` is not an HTTPS URL pointing at a
   * public host, if `etypes` doesn't reference any entity in the app's
   * schema, if `actions` is empty, or if the app has hit its webhook limit.
   *
   * An app may have at most **100 active webhooks** at a time; {@link delete}
   * a webhook to free up a slot before creating another.
   *
   * @example
   * const webhook = await db.webhooks.manager.create({
   *   url: 'https://example.com/instant',
   *   etypes: ['posts', 'comments'],
   *   actions: ['create', 'update'],
   * });
   */
  async create(params: CreateWebhookParams<Schema>): Promise<WebhookInfo> {
    const res = await this.#authedFetch(`/dash/apps/${this.#appId}/webhooks`, {
      method: 'POST',
      body: params,
    });
    return toWebhookInfo(res.webhook);
  }

  /**
   * Updates a webhook's `url`, `etypes`, and/or `actions`. Pass only the
   * fields you want to change; omitted fields keep their current value.
   *
   * Does not affect the webhook's status — use {@link enable} or
   * {@link disable} for that.
   */
  async update(
    webhookId: string,
    params: UpdateWebhookParams<Schema>,
  ): Promise<WebhookInfo> {
    const res = await this.#authedFetch(
      `/dash/apps/${this.#appId}/webhooks/${webhookId}`,
      { method: 'POST', body: params },
    );
    return toWebhookInfo(res.webhook);
  }

  /**
   * Deletes a webhook. No further events will be queued for it. Returns the
   * webhook as it looked just before deletion.
   */
  async delete(webhookId: string): Promise<WebhookInfo> {
    const res = await this.#authedFetch(
      `/dash/apps/${this.#appId}/webhooks/${webhookId}`,
      { method: 'DELETE' },
    );
    return toWebhookInfo(res.webhook);
  }

  /**
   * Re-enables a disabled webhook. Clears `disabledReason` and resumes
   * delivery for new events. Has no effect if the webhook is already active.
   *
   * Events that occurred while the webhook was disabled are not retroactively
   * delivered.
   */
  async enable(webhookId: string): Promise<WebhookInfo> {
    const res = await this.#authedFetch(
      `/dash/apps/${this.#appId}/webhooks/${webhookId}/enable`,
      { method: 'POST', body: {} },
    );
    return toWebhookInfo(res.webhook);
  }

  /**
   * Disables a webhook. No new events will be queued until it is re-enabled
   * via {@link enable}. In-flight events already being processed will still
   * complete.
   *
   * @param opts.reason  Optional human-readable note stored on the webhook
   *                     and surfaced in the dashboard.
   */
  async disable(
    webhookId: string,
    opts?: { reason?: string | null | undefined } | null | undefined,
  ): Promise<WebhookInfo> {
    const body = opts?.reason ? { reason: opts.reason } : {};
    const res = await this.#authedFetch(
      `/dash/apps/${this.#appId}/webhooks/${webhookId}/disable`,
      { method: 'POST', body },
    );
    return toWebhookInfo(res.webhook);
  }

  /**
   * Returns a page of events for a webhook, newest first.
   *
   * Events are retained for ~60 days. To paginate, pass the previous page's
   * `pageInfo.endCursor` as `opts.after`; stop when `pageInfo.hasNextPage`
   * is `false`.
   */
  async listEvents(
    webhookId: string,
    opts?: { after?: string | null | undefined } | null | undefined,
  ): Promise<WebhookEventsPage> {
    const qs = opts?.after ? `?after=${encodeURIComponent(opts.after)}` : '';
    const res = await this.#authedFetch(
      `/dash/apps/${this.#appId}/webhooks/${webhookId}/events${qs}`,
    );
    return {
      events: (res.events || []).map(toWebhookEventInfo),
      pageInfo: {
        startCursor: res.pageInfo?.startCursor ?? null,
        endCursor: res.pageInfo?.endCursor ?? null,
        hasNextPage: !!res.pageInfo?.hasNextPage,
      },
    };
  }

  /**
   * Fetches a single webhook event by its `isn`.
   */
  async getEvent(webhookId: string, isn: string): Promise<WebhookEventInfo> {
    const res = await this.#authedFetch(
      `/dash/apps/${this.#appId}/webhooks/${webhookId}/events/${isn}`,
    );
    return toWebhookEventInfo(res.event);
  }

  /** Returns the full payload for an event. */
  async getPayload(
    webhookId: string,
    isn: string,
  ): Promise<WebhookPayload<Schema>> {
    return this.#authedFetch(
      `/webhooks/payload/${this.#appId}/${webhookId}/${isn}`,
    );
  }

  /**
   * Re-queues an event for delivery, regardless of its current status. Use
   * this to retry a `failed` event or force a redelivery of a `success` one.
   *
   * The server rate-limits resends; if the event was queued or resent very
   * recently the call will fail with a validation error asking you to try
   * again in about a minute.
   */
  async resendEvent(webhookId: string, isn: string): Promise<WebhookEventInfo> {
    const res = await this.#authedFetch(
      `/dash/apps/${this.#appId}/webhooks/${webhookId}/events/${isn}`,
      { method: 'POST', body: {} },
    );
    return toWebhookEventInfo(res.event);
  }
}

/**
 * Verify incoming webhook requests from Instant, dispatch their records to
 * typed handlers, and manage webhook subscriptions (via {@link manager}).
 *
 * Usually accessed as `db.webhooks` on the admin or platform SDK rather than
 * constructed directly.
 */
export class Webhooks<Schema extends InstantSchemaDef<any, any, any>> {
  /** App this instance is bound to. */
  appId: string | null | undefined;
  /** Schema used to type webhook payloads and handler records. */
  schema: Schema | null | undefined;
  #token: string | null | undefined;
  /** Base URL for the Instant API. */
  apiURI: string;
  #jsonFetch: JsonFetch;
  /** Manage webhook subscriptions and inspect delivery events. */
  manager: WebhooksManager<Schema>;

  /**
   * Schema-bound helpers for building typed handler maps.
   *
   * - `typedHandlers(etype, action, handler)` builds a single typed entry.
   *   Pass `'$default'` for `etype` to register a catch-all handler.
   * - `combineHandlers(...entries)` merges entries into a
   *   {@link WebhookHandlers} object suitable for {@link processPayload} and
   *   {@link processRequest}.
   *
   * If you already have a {@link Webhooks} instance, prefer the instance
   * form (`db.webhooks.helpers()`) — it infers `Schema` automatically.
   *
   * @example
   * const { typedHandlers, combineHandlers } = Webhooks.helpers<typeof schema>();
   * const handlers = combineHandlers(
   *   typedHandlers('posts', 'create', (record) => { ... }),
   *   typedHandlers('comments', '$default', (record) => { ... }),
   *   typedHandlers('$default', (record) => { ... }),
   * );
   */
  static helpers<
    Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
  >(): WebhookHelpers<Schema> {
    function typedHandlers(...args: any[]): any {
      if (args.length === 2) {
        return { $default: args[1] };
      }
      const [etype, action, handler] = args;
      return { [etype]: { [action]: handler } };
    }
    function combineHandlers(...entries: any[]): any {
      const result: any = {};
      for (const entry of entries) {
        for (const key of Object.keys(entry)) {
          if (key === '$default') {
            result.$default = entry.$default;
          } else {
            result[key] = { ...result[key], ...entry[key] };
          }
        }
      }
      return result;
    }
    return {
      typedHandlers: typedHandlers as any,
      combineHandlers: combineHandlers as any,
    };
  }

  /**
   * Instance form of {@link Webhooks.helpers} that infers `Schema` from this
   * instance — no `<typeof schema>` type argument required.
   *
   * @example
   * const { typedHandlers, combineHandlers } = db.webhooks.helpers();
   */
  helpers(): WebhookHelpers<Schema> {
    return Webhooks.helpers<Schema>();
  }

  constructor(config: Config<Schema>, jsonFetch?: JsonFetch) {
    this.appId = config.appId;
    this.schema = config.schema;

    this.#token = config.adminToken || config.token;
    this.apiURI = config.apiURI || 'https://api.instantdb.com';
    this.#jsonFetch = jsonFetch || defaultJsonFetch;
    this.manager = new WebhooksManager<Schema>({
      appId: this.appId,
      apiURI: this.apiURI,
      token: this.#token,
      withAuth: config.withAuth,
      jsonFetch: this.#jsonFetch,
    });
  }

  /** Fetches Instant's JWK set for verifying webhook signatures. */
  async fetchJwks() {
    const resp = await this.#jsonFetch(
      `${this.apiURI}/.well-known/webhooks/jwks.json`,
    );
    return resp;
  }

  /**
   * Resolves a `kid` to an imported {@link CryptoKey}, hitting a
   * process-wide cache on repeat calls. Falls back to {@link fetchJwks} if
   * the key isn't already known.
   */
  async keyOfKid(
    kid: string,
  ): Promise<{ alg: ImportAlgorithm; key: CryptoKey }> {
    const cached = keyCache[kid];
    if (cached) {
      return cached;
    }

    const jwk =
      knownKeys[this.apiURI]?.keys.find((k: any) => k.kid === kid) ||
      (await this.fetchJwks())?.keys?.find((k: any) => k.kid === kid);

    if (!jwk) {
      throw new InstantError('Could not find matching signing key', { kid });
    }

    const res = await importKey(jwk);
    keyCache[kid] = res;
    return res;
  }

  /**
   * Verifies an `Instant-Signature` header against a body and returns the
   * parsed {@link WebhookBody} (containing the `payloadUrl` and a JWT
   * `token` for fetching the records).
   *
   * Throws if the signature doesn't validate, the signature is older than
   * `opts.tolerance` (default 300 seconds), or the body doesn't decode to
   * the expected shape.
   *
   * @param body  Either the raw body string, or a function returning it.
   *              Use a function to defer reading the body until after the
   *              header has been parsed.
   */
  async validate(
    signatureHeader: string,
    body: string | (() => Promise<string>),
    opts?:
      | {
          receivedAt?: Date | null | undefined;
          tolerance?: number | null | undefined;
        }
      | null
      | undefined,
  ): Promise<WebhookBody> {
    const receivedAt = opts?.receivedAt || new Date();
    const { t, kid, v1 } = parseSignatureHeader(signatureHeader);
    const tolerance = opts?.tolerance || defaultTolerance;
    validateT(receivedAt, t, tolerance);

    const { alg, key } = await this.keyOfKid(kid);
    const bodyText = typeof body === 'function' ? await body() : body;

    const message = new TextEncoder().encode(`${t}.${bodyText}`);

    const verified = await verify(alg, key, hexToUint8Array(v1), message);

    if (!verified) {
      throw new InstantError('Instant Signature did not validate', {
        header: signatureHeader,
      });
    }

    const res = JSON.parse(bodyText);
    if (
      typeof res !== 'object' ||
      typeof res.payloadUrl !== 'string' ||
      typeof res.token !== 'string'
    ) {
      throw new InstantError(
        'Invalid webhook body, expected an object with payloadUrl and token fields',
        { body: res },
      );
    }
    return res;
  }

  /**
   * Pulls the `Instant-Signature` header and body from a `Request` and
   * delegates to {@link validate}. Throws if the header is missing.
   */
  async validateRequest(
    req: Request,
    opts?:
      | {
          tolerance?: number | null | undefined;
          receivedAt?: Date | null | undefined;
        }
      | null
      | undefined,
  ): Promise<WebhookBody> {
    const signatureHeader = req.headers.get('instant-signature');
    if (!signatureHeader) {
      throw new InstantError('Request is missing Instant-Signature header');
    }
    return this.validate(signatureHeader, () => req.text(), opts);
  }

  /**
   * Fetches the records and `idempotencyKey` for a validated
   * {@link WebhookBody}, authenticating with the JWT `token` it carries.
   */
  fetchPayloads({
    payloadUrl,
    token,
  }: WebhookBody): Promise<WebhookPayload<Schema>> {
    return this.#jsonFetch(payloadUrl, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
  }

  /**
   * Dispatches each record in `payload` to its matching handler in
   * `handlers`. Resolution order per record: exact `etype` + `action` →
   * `etype`'s `$default` → top-level `$default`. Records with no matching
   * handler are skipped.
   *
   * Handlers run concurrently. The returned promise resolves once every
   * handler has settled (success or failure); rejections in individual
   * handlers do not bubble up.
   */
  async processPayload(
    handlers: WebhookHandlers<Schema>,
    payload: WebhookPayload<Schema>,
  ): Promise<void> {
    const results: any[] = [];
    for (const record of payload.data) {
      const { etype, action } = record;
      const handler =
        handlers?.[etype]?.[action] ||
        handlers?.[etype]?.$default ||
        handlers?.$default;
      if (handler) {
        // We need the as any here because typescript
        // has trouble correlating the handler to the
        // record etype and action
        results.push(handler(record as any));
      }
    }
    await Promise.allSettled(results);
  }

  /**
   * The one-liner for handling webhooks. Hand it your handlers and the
   * incoming `Request` — it verifies the signature, fetches the records, and
   * dispatches each one to your code.
   *
   * Async handlers are executed in parallel, the return promise will resolve once
   * all handlers complete and will reject if any of the handlers fails.
   *
   * @example
   * const { typedHandlers, combineHandlers } = db.webhooks.helpers();
   *
   * const handlers = combineHandlers(
   *   typedHandlers('posts', 'create', async (record) => {
   *     await sendNewPostEmail(record.after);
   *   }),
   *   typedHandlers('$default', (record) => {
   *     console.log('webhook event', record);
   *   }),
   * );
   *
   * export async function POST(req: Request) {
   *   await db.webhooks.processRequest(handlers, req);
   *   return new Response('ok');
   * }
   */
  async processRequest(
    handlers: WebhookHandlers<Schema>,
    req: Request,
    opts?:
      | {
          tolerance?: number | null | undefined;
          receivedAt?: Date | null | undefined;
        }
      | null
      | undefined,
  ): Promise<void> {
    const body = await this.validateRequest(req, opts);
    const payload = await this.fetchPayloads(body);
    await this.processPayload(handlers, payload);
  }

  /**
   * Adapter for frameworks that hand you a Node-style `http.IncomingMessage`
   * (Next.js Pages Router, Express, Koa, etc.) instead of a Web `Request`.
   * Wraps the request in a Web `Request` and delegates to
   * {@link processRequest}. You still send the HTTP response yourself.
   *
   * The raw body is required for signature verification. The adapter picks
   * it up from one of:
   *
   * - `req.body` if it's a `Buffer` or `Uint8Array` (set by middleware like
   *   `express.raw({ type: 'application/json' })`)
   * - `req.body` if it's a string (set by middleware like `express.text()`)
   * - otherwise the unconsumed request stream
   *
   * Don't use a JSON body parser on this route — `express.json()` and
   * `bodyParser: true` in Next.js both parse the body into an object,
   * destroying the raw bytes the signature was computed over.
   *
   * @example
   * // Next.js Pages Router (`pages/api/webhooks.ts`)
   * import type { NextApiRequest, NextApiResponse } from 'next';
   *
   * export const config = { api: { bodyParser: false } };
   *
   * const { typedHandlers, combineHandlers } = db.webhooks.helpers();
   *
   * const handlers = combineHandlers(
   *   typedHandlers('posts', 'create', async (record) => {
   *     await sendNewPostEmail(record.after);
   *   }),
   *   typedHandlers('$default', (record) => {
   *     console.log('unhandled record', record);
   *   }),
   * );
   *
   * export default async function handler(
   *   req: NextApiRequest,
   *   res: NextApiResponse,
   * ) {
   *   try {
   *     await db.webhooks.processNodeRequest(handlers, req);
   *     res.status(200).end();
   *   } catch (e) {
   *     res.status(400).json({ error: String(e) });
   *   }
   * }
   *
   * @example
   * // Express — skip the JSON body parser on the webhook route and use
   * // `express.raw()` so `req.body` arrives as a Buffer.
   * import express from 'express';
   *
   * const app = express();
   *
   * app.use((req, res, next) => {
   *   if (req.originalUrl === '/webhooks/instant') return next();
   *   express.json()(req, res, next);
   * });
   *
   * app.post(
   *   '/webhooks/instant',
   *   express.raw({ type: 'application/json' }),
   *   async (req, res) => {
   *     try {
   *       await db.webhooks.processNodeRequest(handlers, req);
   *       res.status(200).end();
   *     } catch (e) {
   *       res.status(400).json({ error: String(e) });
   *     }
   *   },
   * );
   *
   * @example
   * // Koa — `ctx.req` is the raw IncomingMessage. If `koa-bodyparser` (or
   * // similar) runs on this route it consumes the stream, so either skip it
   * // here or pull the raw body yourself and shim it onto the request:
   * import Koa from 'koa';
   * import Router from '@koa/router';
   * import rawBody from 'raw-body';
   *
   * const router = new Router();
   *
   * router.post('/webhooks/instant', async (ctx) => {
   *   try {
   *     await db.webhooks.processNodeRequest(handlers, ctx.req, {
   *       body: rawBody(ctx.req), // adapter awaits the Promise
   *     });
   *     ctx.status = 200;
   *   } catch (e) {
   *     ctx.status = 400;
   *     ctx.body = { error: String(e) };
   *   }
   * });
   *
   * @example
   * // NestJS (Express adapter). With `rawBody: true` on the factory, Nest
   * // populates `req.rawBody` itself — just pass `req`.
   * import { Controller, Post, Req, HttpCode } from '@nestjs/common';
   * import type { Request } from 'express';
   *
   * @Controller('webhooks')
   * export class WebhooksController {
   *   @Post('instant')
   *   @HttpCode(200)
   *   async handle(@Req() req: Request) {
   *     await db.webhooks.processNodeRequest(handlers, req);
   *   }
   * }
   *
   * // (Pair with `NestFactory.create(AppModule, { rawBody: true })` in main.ts.)
   */
  async processNodeRequest(
    handlers: WebhookHandlers<Schema>,
    req: {
      url?: string;
      method?: string;
      headers: Record<string, string | string[] | undefined>;
      body?: unknown;
      rawBody?: unknown;
      [Symbol.asyncIterator]?: () => AsyncIterableIterator<Uint8Array | string>;
    },
    opts?:
      | {
          /**
           * Raw body to use instead of reading from `req`. Useful for
           * frameworks that hand you the body separately from the request
           * object (e.g. NestJS `@RawBody()`, Koa with `raw-body`).
           * Accepts a `Buffer` / `Uint8Array`, a string, or a Promise of
           * either.
           */
          body?: unknown;
          tolerance?: number | null | undefined;
          receivedAt?: Date | null | undefined;
        }
      | null
      | undefined,
  ): Promise<void> {
    let rawBody: string;
    let bodyWasReserialized = false;
    // Priority: an explicit `opts.body`, then `req.rawBody` (set by
    // middleware like Firebase Functions or body-parser's `verify` hook),
    // then `req.body`, then the unconsumed request stream.
    let bodyValue: unknown = opts?.body ?? req.rawBody ?? req.body;
    // Allow callers to pass a Promise (e.g. the result of `raw-body(ctx.req)`
    // in Koa) without having to await first.
    if (
      bodyValue != null &&
      typeof (bodyValue as { then?: unknown }).then === 'function'
    ) {
      bodyValue = await (bodyValue as PromiseLike<unknown>);
    }
    if (typeof bodyValue === 'string') {
      rawBody = bodyValue;
    } else if (bodyValue instanceof Uint8Array) {
      rawBody = new TextDecoder('utf-8').decode(bodyValue);
    } else if (bodyValue != null && typeof bodyValue === 'object') {
      // A JSON parser middleware (e.g. `express.json()`) has consumed the
      // stream and handed us a parsed object. Re-serialize and try anyway —
      // for Instant's webhook body shape this typically round-trips to the
      // bytes the server signed. If it doesn't, we surface a targeted error
      // below.
      try {
        rawBody = JSON.stringify(bodyValue);
        bodyWasReserialized = true;
      } catch {
        throw new InstantError(
          'Webhook request body has already been parsed and could not be re-serialized. Configure this route to receive the raw request body instead of parsed JSON.',
        );
      }
    } else if (req[Symbol.asyncIterator]) {
      const encoder = new TextEncoder();
      const chunks: Uint8Array[] = [];
      for await (const chunk of req as AsyncIterable<Uint8Array | string>) {
        chunks.push(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      let total = 0;
      for (const c of chunks) total += c.byteLength;
      const buf = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        buf.set(c, offset);
        offset += c.byteLength;
      }
      rawBody = new TextDecoder('utf-8').decode(buf);
    } else {
      throw new InstantError(
        'Could not read the webhook request body. Pass a Node IncomingMessage with an unconsumed stream, or set `req.body` to the raw bytes (Buffer/Uint8Array) or string.',
      );
    }

    const host =
      typeof req.headers.host === 'string' ? req.headers.host : 'localhost';
    const url = new URL(req.url ?? '/', `https://${host}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(', '));
    }
    const webReq = new Request(url, {
      method: req.method ?? 'POST',
      headers,
      body: rawBody,
    });
    try {
      await this.processRequest(handlers, webReq, opts);
    } catch (e) {
      if (
        bodyWasReserialized &&
        e instanceof InstantError &&
        e.message === 'Instant Signature did not validate'
      ) {
        throw new InstantError(
          'Webhook signature did not validate. The request body was re-serialized from a parsed JSON object, which can produce different bytes than the server signed. Configure this route to receive the raw request body instead of parsed JSON.',
          { hint: e.hint },
        );
      }
      throw e;
    }
  }
}
