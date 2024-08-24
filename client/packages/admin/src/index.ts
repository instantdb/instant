import { tx, lookup, TransactionChunk, getOps } from "@instantdb/core";
import { User, AuthToken, id } from "@instantdb/core";

// Query Types
// -----

// NonEmpty disallows {}, so that you must provide at least one field
type NonEmpty<T> = {
  [K in keyof T]-?: Required<Pick<T, K>>;
}[keyof T];

type WhereArgs = {
  in?: (string | number | boolean)[];
};

type WhereClauseValue = string | number | boolean | NonEmpty<WhereArgs>;

type BaseWhereClause = {
  [key: string]: WhereClauseValue;
};

type WhereClauseWithCombination = {
  or?: WhereClause[] | WhereClauseValue;
  and?: WhereClause[] | WhereClauseValue;
};

type WhereClause =
  | WhereClauseWithCombination
  | (WhereClauseWithCombination & BaseWhereClause);

/**
 * A tuple representing a cursor.
 * These should not be constructed manually. The current format
 * is an implementation detail that may change in the future.
 * Use the `endCursor` or `startCursor` from the PageInfoResponse as the
 * `before` or `after` field in the query options.
 */
type Cursor = [string, string, any, number];

type Direction = "asc" | "desc";

type Order = { serverCreatedAt: Direction };

type $Option = {
  $?: {
    where?: WhereClause;
    order?: Order;
    limit?: number;
    last?: number;
    first?: number;
    offset?: number;
    after?: Cursor;
    before?: Cursor;
  };
};

type Subquery = { [namespace: string]: NamespaceVal };

type NamespaceVal = $Option | ($Option & Subquery);

interface Query {
  [namespace: string]: NamespaceVal;
}

type InstantObject = {
  id: string;
  [prop: string]: any;
};

type ResponseObject<K, Schema> = K extends keyof Schema
  ? { id: string } & Schema[K]
  : InstantObject;

type IsEmptyObject<T> = T extends Record<string, never> ? true : false;

type ResponseOf<Q, Schema> = {
  [K in keyof Q]: IsEmptyObject<Q[K]> extends true
    ? ResponseObject<K, Schema>[]
    : (ResponseOf<Q[K], Schema> & ResponseObject<K, Schema>)[];
};

type Remove$<T> = T extends object
  ? { [K in keyof T as Exclude<K, "$">]: Remove$<T[K]> }
  : T;

type QueryResponse<T, Schema> = ResponseOf<
  { [K in keyof T]: Remove$<T[K]> },
  Schema
>;

/**
 * `debugQuery` returns the results of evaluating the corresponding permissions rules for each record.
 */
export type DebugCheckResult = {
  /** The ID of the record. */
  id: string;
  /** The namespace/table of the record. */
  entity: string;
  /** The value of the record. */
  record: Record<string, any>;
  /** The result of evaluating the corresponding permissions rule for a record. */
  check: any;
};

/**
 * (XXX)
 * https://github.com/microsoft/TypeScript/issues/26051
 *
 * Typescript can permit extra keys when a generic extends a type.
 *
 * For some reason, it makes it possible to write a query like so:
 *
 * dummyQuery({
 *  users: {
 *    $: { where: { "foo": 1 } },
 *    posts: {
 *      $: { "far": {} }
 *    }
 *  }
 *
 *  The problem: $: { "far": {} }
 *
 *  This passes, when it should in reality fail. I don't know why
 *  adding `Exactly` fixes this, but it does.
 *
 * */
type Exactly<Parent, Child extends Parent> = Parent & {
  [K in keyof Child]: K extends keyof Parent ? Child[K] : never;
};

type Config = {
  appId: string;
  adminToken: string;
  apiURI?: string;
};

type FilledConfig = Config & { apiURI: string };

type ImpersonationOpts =
  | { email: string }
  | { token: AuthToken }
  | { guest: boolean };

function configWithDefaults(config: Config): FilledConfig {
  const defaultConfig = {
    apiURI: "https://api.instantdb.com",
  };
  const r = { ...defaultConfig, ...config };
  return r;
}

function withImpersonation(
  headers: { [key: string]: string },
  opts: ImpersonationOpts,
) {
  if ("email" in opts) {
    headers["as-email"] = opts.email;
  } else if ("token" in opts) {
    headers["as-token"] = opts.token;
  } else if ("guest" in opts) {
    headers["as-guest"] = "true";
  }
  return headers;
}

function authorizedHeaders(
  config: FilledConfig,
  impersonationOpts?: ImpersonationOpts,
) {
  const { adminToken, appId } = config;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${adminToken}`,
    "app-id": appId,
  };
  return impersonationOpts
    ? withImpersonation(headers, impersonationOpts)
    : headers;
}

function isCloudflareWorkerRuntime() {
  return (
    // @ts-ignore
    typeof WebSocketPair !== "undefined" ||
    // @ts-ignore
    (typeof navigator !== "undefined" &&
      navigator.userAgent === "Cloudflare-Workers") ||
    // @ts-ignore
    (typeof EdgeRuntime !== "undefined" && EdgeRuntime === "vercel")
  );
}

// (XXX): Cloudflare Workers don't support cache: "no-store"
// We need to set `cache: "no-store"` so Next.js doesn't cache the fetch
// To keep Cloudflare Workers working, we need to conditionally set the fetch options
// Once Cloudflare Workers support `cache: "no-store"`, we can remove this conditional
// https://github.com/cloudflare/workerd/issues/698

const FETCH_OPTS: RequestInit = isCloudflareWorkerRuntime()
  ? {}
  : { cache: "no-store" };

async function jsonFetch(
  input: RequestInfo,
  init: RequestInit | undefined,
): Promise<any> {
  const res = await fetch(input, { ...FETCH_OPTS, ...init });
  const json = await res.json();
  return res.status === 200
    ? Promise.resolve(json)
    : Promise.reject({ status: res.status, body: json });
}

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  const db = init({ appId: "my-app-id" })
 *
 * // You can also provide a schema for type safety and editor autocomplete!
 *
 *  type Schema = {
 *    goals: {
 *      title: string
 *    }
 *  }
 *
 *  const db = init<Schema>({ appId: "my-app-id" })
 *
 */
function init<Schema = {}>(config: Config) {
  return new InstantAdmin<Schema>(config);
}

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` and `adminToken` :)
 *
 * @example
 *  const db = init({ appId: "my-app-id", adminToken: "my-admin-token" })
 */
class InstantAdmin<Schema = {}> {
  config: FilledConfig;
  auth: Auth;
  impersonationOpts?: ImpersonationOpts;

  constructor(_config: Config) {
    this.config = configWithDefaults(_config);
    this.auth = new Auth(this.config);
  }

  /**
   * Sometimes you want to scope queries to a specific user.
   *
   * You can provide a user's auth token, email, or impersonate a guest.
   *
   * @see https://instantdb.com/docs/backend#impersonating-users
   * @example
   *  await db.asUser({email: "stopa@instantdb.com"}).query({ goals: {} })
   */
  asUser = (opts: ImpersonationOpts): InstantAdmin<Schema> => {
    const newClient = new InstantAdmin<Schema>({ ...this.config });
    newClient.impersonationOpts = opts;
    return newClient;
  };

  /**
   * Use this to query your data!
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *  // fetch all goals
   *  await db.query({ goals: {} })
   *
   *  // goals where the title is "Get Fit"
   *  await db.query({ goals: { $: { where: { title: "Get Fit" } } } })
   *
   *  // all goals, _alongside_ their todos
   *  await db.query({ goals: { todos: {} } })
   */
  query = <Q extends Query>(
    query: Exactly<Query, Q>,
  ): Promise<QueryResponse<Q, Schema>> => {
    return jsonFetch(`${this.config.apiURI}/admin/query`, {
      method: "POST",
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({ query: query }),
    });
  };

  /**
   * Use this to write data! You can create, update, delete, and link objects
   *
   * @see https://instantdb.com/docs/instaml
   *
   * @example
   *   // Create a new object in the `goals` namespace
   *   const goalId = id();
   *   db.transact(tx.goals[goalId].update({title: "Get fit"}))
   *
   *   // Update the title
   *   db.transact(tx.goals[goalId].update({title: "Get super fit"}))
   *
   *   // Delete it
   *   db.transact(tx.goals[goalId].delete())
   *
   *   // Or create an association:
   *   todoId = id();
   *   db.transact([
   *    tx.todos[todoId].update({ title: 'Go on a run' }),
   *    tx.goals[goalId].link({todos: todoId}),
   *  ])
   */
  transact = (inputChunks: TransactionChunk | TransactionChunk[]) => {
    const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
    const steps = chunks.flatMap((tx) => getOps(tx));
    return jsonFetch(`${this.config.apiURI}/admin/transact`, {
      method: "POST",
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({ steps: steps }),
    });
  };

  /**
   * Like `query`, but returns debugging information
   * for permissions checks along with the result.
   * Useful for inspecting the values returned by the permissions checks.
   * Note, this will return debug information for *all* entities
   * that match the query's `where` clauses.
   *
   * Requires a user/guest context to be set with `asUser`,
   * since permissions checks are user-specific.
   *
   * Accepts an optional configuration object with a `rules` key.
   * The provided rules will override the rules in the database for the query.
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *  await db.asUser({ guest: true }).debugQuery(
   *    { goals: {} },
   *    { rules: { goals: { allow: { read: "auth.id != null" } } }
   *  )
   */
  debugQuery = async <Q extends Query>(
    query: Exactly<Query, Q>,
    opts?: { rules: any },
  ): Promise<{
    result: QueryResponse<Q, Schema>;
    checkResults: DebugCheckResult[];
  }> => {
    const response = await jsonFetch(
      `${this.config.apiURI}/admin/query_perms_check`,
      {
        method: "POST",
        headers: authorizedHeaders(this.config, this.impersonationOpts),
        body: JSON.stringify({ query, "rules-override": opts?.rules }),
      },
    );

    return {
      result: response.result,
      checkResults: response["check-results"],
    };
  };

  /**
   * Like `transact`, but does not write to the database.
   * Returns debugging information for permissions checks.
   * Useful for inspecting the values returned by the permissions checks.
   *
   * Requires a user/guest context to be set with `asUser`,
   * since permissions checks are user-specific.
   *
   * Accepts an optional configuration object with a `rules` key.
   * The provided rules will override the rules in the database for the duration of the transaction.
   *
   * @example
   *   const goalId = id();
   *   db.asUser({ guest: true }).debugTransact(
   *      [tx.goals[goalId].update({title: "Get fit"})],
   *      { rules: { goals: { allow: { update: "auth.id != null" } } }
   *   )
   */
  debugTransact = (
    inputChunks: TransactionChunk | TransactionChunk[],
    opts?: { rules?: any },
  ) => {
    const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
    const steps = chunks.flatMap((tx) => getOps(tx));
    return jsonFetch(`${this.config.apiURI}/admin/transact_perms_check`, {
      method: "POST",
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({
        steps: steps,
        "rules-override": opts?.rules,
        // @ts-expect-error because we're using a private API (for now)
        "dangerously-commit-tx": opts?.__dangerouslyCommit,
      }),
    });
  };
}

class Auth {
  config: FilledConfig;

  constructor(config: FilledConfig) {
    this.config = config;
  }

  /**
   * Creates a login token for the user with the given email.
   * If that user does not exist, we create one.
   *
   * This is often useful for writing custom auth flows.
   *
   * @example
   *   app.post('/custom_sign_in', async (req, res) => {
   *     // ... your custom flow for users
   *     const token = await db.auth.createToken(email)
   *     return res.status(200).send({ token })
   *   })
   *
   * @see https://instantdb.com/docs/backend#custom-auth
   */
  createToken = async (email: string): Promise<AuthToken> => {
    const ret: { user: { refresh_token: string } } = await jsonFetch(
      `${this.config.apiURI}/admin/refresh_tokens`,
      {
        method: "POST",
        headers: authorizedHeaders(this.config),
        body: JSON.stringify({ email }),
      },
    );
    return ret.user.refresh_token;
  };

  /**
   * Verifies a given token and returns the associated user.
   *
   * This is often useful for writing custom endpoints, where you need
   * to authenticate users.
   *
   * @example
   *   app.post('/custom_endpoint', async (req, res) => {
   *     const user = await db.auth.verifyToken(req.headers['token'])
   *     if (!user) {
   *       return res.status(400).send('Uh oh, you are not authenticated')
   *     }
   *     // ...
   *   })
   * @see https://instantdb.com/docs/backend#custom-endpoints
   */
  verifyToken = async (token: AuthToken): Promise<User> => {
    const res = await jsonFetch(
      `${this.config.apiURI}/runtime/auth/verify_refresh_token`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          "app-id": this.config.appId,
          "refresh-token": token,
        }),
      },
    );
    return res.user;
  };

  /**
   * Retrieves an app user by id, email, or refresh token.
   *
   * @example
   *   try {
   *     const user = await db.auth.getUser({ email })
   *     console.log("Found user:", user)
   *   } catch (err) {
   *     console.error("Failed to retrieve user:", err.message);
   *   }
   *
   * @see https://instantdb.com/docs/backend#retrieve-a-user
   */
  getUser = async (
    params: { email: string } | { id: string } | { refresh_token: string },
  ): Promise<User> => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`);
    const response: { user: User } = await jsonFetch(
      `${this.config.apiURI}/admin/users?${qs}`,
      {
        method: "GET",
        headers: authorizedHeaders(this.config),
      },
    );

    return response.user;
  };

  /**
   * Deletes an app user by id, email, or refresh token.
   *
   * NB: This _only_ deletes the user; it does not delete all user data.
   * You will need to handle this manually.
   *
   * @example
   *   try {
   *     const deletedUser = await db.auth.deleteUser({ email })
   *     console.log("Deleted user:", deletedUser)
   *   } catch (err) {
   *     console.error("Failed to delete user:", err.message);
   *   }
   *
   * @see https://instantdb.com/docs/backend#delete-a-user
   */
  deleteUser = async (
    params: { email: string } | { id: string } | { refresh_token: string },
  ): Promise<User> => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`);
    const response: { deleted: User } = await jsonFetch(
      `${this.config.apiURI}/admin/users?${qs}`,
      {
        method: "DELETE",
        headers: authorizedHeaders(this.config),
      },
    );

    return response.deleted;
  };

  /**
   * Signs out the user with the given email.
   * This invalidates any tokens associated with the user.
   * If the user is not found, an error will be thrown.
   *
   * @example
   *   try {
   *     await auth.signOut("alyssa_p_hacker@instantdb.com");
   *     console.log("Successfully signed out");
   *   } catch (err) {
   *     console.error("Sign out failed:", err.message);
   *   }
   *
   * @see https://instantdb.com/docs/backend#sign-out
   */
  async signOut(email: string): Promise<void> {
    const config = this.config;
    await jsonFetch(`${config.apiURI}/admin/sign_out`, {
      method: "POST",
      headers: authorizedHeaders(config),
      body: JSON.stringify({ email }),
    });
  }
}

export {
  init,
  id,
  tx,
  lookup,

  // types
  Config,
  ImpersonationOpts,
  TransactionChunk,
};
