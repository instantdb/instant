import {
  tx,
  lookup,
  getOps,
  i,
  id,
  txInit,
  version as coreVersion,
  type TransactionChunk,
  type AuthToken,
  type Exactly,

  // core types
  type User,
  type Query,

  // query types
  type QueryResponse,
  type InstaQLResponse,
  type InstaQLParams,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantSchemaDatabase,
  type InstantObject,
  type InstantEntity,
  type BackwardsCompatibleSchema,
  type IInstantDatabase,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type ValueTypes,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type InstaQLEntity,
  type InstaQLResult,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
} from "@instantdb/core";

import version from "./version";

type DebugCheckResult = {
  /** The ID of the record. */
  id: string;
  /** The namespace/table of the record. */
  entity: string;
  /** The value of the record. */
  record: Record<string, any>;
  /** The result of evaluating the corresponding permissions rule for a record. */
  check: any;
};

type Config = {
  appId: string;
  adminToken: string;
  apiURI?: string;
};

type InstantConfig<Schema extends InstantSchemaDef<any, any, any>> = {
  appId: string;
  adminToken: string;
  apiURI?: string;
  schema?: Schema;
};

type InstantConfigFilled<Schema extends InstantSchemaDef<any, any, any>> =
  InstantConfig<Schema> & { apiURI: string };

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

function instantConfigWithDefaults<
  Schema extends InstantSchemaDef<any, any, any>,
>(config: InstantConfig<Schema>): InstantConfigFilled<Schema> {
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
  const headers = {
    ...(init.headers || {}),
    "Instant-Admin-Version": version,
    "Instant-Core-Version": coreVersion,
  };
  const res = await fetch(input, { ...FETCH_OPTS, ...init, headers });
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
 *  import { init } from "@instantdb/admin"
 *
 *  const db = init({
 *    appId: "my-app-id",
 *    adminToken: process.env.INSTANT_ADMIN_TOKEN
 *  })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/admin"
 *  import schema from ""../instant.schema.ts";
 *
 *  const db = init({
 *    appId: "my-app-id",
 *    adminToken: process.env.INSTANT_ADMIN_TOKEN,
 *    schema,
 *  })
 *  // To learn more: https://instantdb.com/docs/modeling-data
 */
function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
>(config: InstantConfig<Schema>) {
  return new InstantAdminDatabase<Schema>(config);
}

/**
 * @deprecated
 * `init_experimental` is deprecated. You can replace it with `init`.
 *
 * @example
 *
 * // Before
 * import { init_experimental } from "@instantdb/admin"
 * const db = init_experimental({  ...  });
 *
 * // After
 * import { init } from "@instantdb/admin"
 * const db = init({ ...  });
 */
const init_experimental = init;

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` and `adminToken` :)
 *
 * @example
 *  const db = init({ appId: "my-app-id", adminToken: "my-admin-token" })
 */
class InstantAdmin<
  Schema extends InstantGraph<any, any> | {},
  WithCardinalityInference extends boolean,
> {
  config: FilledConfig;
  auth: Auth;
  storage: Storage;
  impersonationOpts?: ImpersonationOpts;

  public tx =
    txInit<
      Schema extends InstantGraph<any, any> ? Schema : InstantGraph<any, any>
    >();

  constructor(_config: Config) {
    this.config = configWithDefaults(_config);
    this.auth = new Auth(this.config);
    this.storage = new Storage(this.config);
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
  asUser = (
    opts: ImpersonationOpts,
  ): InstantAdmin<Schema, WithCardinalityInference> => {
    const newClient = new InstantAdmin<Schema, WithCardinalityInference>({
      ...this.config,
    });
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
  query = <
    Q extends Schema extends InstantGraph<any, any>
      ? InstaQLParams<Schema>
      : Exactly<Query, Q>,
  >(
    query: Q,
  ): Promise<QueryResponse<Q, Schema, WithCardinalityInference>> => {
    const withInference =
      "cardinalityInference" in this.config
        ? Boolean(this.config.cardinalityInference)
        : true;

    return jsonFetch(`${this.config.apiURI}/admin/query`, {
      method: "POST",
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({
        query: query,
        "inference?": withInference,
      }),
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
  transact = (
    inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  ) => {
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
    result: QueryResponse<Q, Schema, WithCardinalityInference>;
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
    inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
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
   * Generates a magic code for the user with the given email,  used to sign in on the frontend.
   * This is useful for writing custom auth flows.
   *
   * @example
   *   try {
   *     const user = await db.auth.generateMagicCode({ email })
   *     // send an email to user with magic code
   *   } catch (err) {
   *     console.error("Failed to generate magic code:", err.message);
   *   }
   *
   * @see https://instantdb.com/docs/backend#generate-magic-code
   */
  generateMagicCode = async (email: string): Promise<{ code: string }> => {
    return jsonFetch(`${this.config.apiURI}/admin/magic_code`, {
      method: "POST",
      headers: authorizedHeaders(this.config),
      body: JSON.stringify({ email }),
    });
  };

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
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");

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

type UploadMetadata = { contentType?: string } & Record<string, any>;
type StorageFile = {
  key: string;
  name: string;
  size: number;
  etag: string;
  last_modified: number;
};

/**
 * Functions to manage file storage.
 */
class Storage {
  config: FilledConfig;

  constructor(config: FilledConfig) {
    this.config = config;
  }

  /**
   * Uploads file at the provided path.
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   const buffer = fs.readFileSync('demo.png');
   *   const isSuccess = await db.storage.upload('photos/demo.png', buffer);
   */
  upload = async (
    pathname: string,
    file: Buffer,
    metadata: UploadMetadata = {},
  ): Promise<boolean> => {
    const { data: presignedUrl } = await jsonFetch(
      `${this.config.apiURI}/admin/storage/signed-upload-url`,
      {
        method: "POST",
        headers: authorizedHeaders(this.config),
        body: JSON.stringify({
          app_id: this.config.appId,
          filename: pathname,
        }),
      },
    );
    const { ok } = await fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": metadata.contentType || "application/octet-stream",
      },
    });

    return ok;
  };

  /**
   * Retrieves a download URL for the provided path.
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   const url = await db.storage.getDownloadUrl('photos/demo.png');
   */
  getDownloadUrl = async (pathname: string): Promise<string> => {
    const { data } = await jsonFetch(
      `${this.config.apiURI}/admin/storage/signed-download-url?app_id=${this.config.appId}&filename=${encodeURIComponent(pathname)}`,
      {
        method: "GET",
        headers: authorizedHeaders(this.config),
      },
    );

    return data;
  };

  /**
   * Retrieves a list of all the files that have been uploaded by this app.
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   const files = await db.storage.list();
   */
  list = async (): Promise<StorageFile[]> => {
    const { data } = await jsonFetch(
      `${this.config.apiURI}/admin/storage/files`,
      {
        method: "GET",
        headers: authorizedHeaders(this.config),
      },
    );

    return data;
  };

  /**
   * Deletes a file by its path name (e.g. "photos/demo.png").
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   await db.storage.delete("photos/demo.png");
   */
  delete = async (pathname: string): Promise<void> => {
    await jsonFetch(
      `${this.config.apiURI}/admin/storage/files?filename=${encodeURIComponent(pathname)}`,
      {
        method: "DELETE",
        headers: authorizedHeaders(this.config),
      },
    );
  };

  /**
   * Deletes multiple files by their path names (e.g. "photos/demo.png", "essays/demo.txt").
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   await db.storage.deleteMany(["images/1.png", "images/2.png", "images/3.png"]);
   */
  deleteMany = async (pathnames: string[]): Promise<void> => {
    await jsonFetch(`${this.config.apiURI}/admin/storage/files/delete`, {
      method: "POST",
      headers: authorizedHeaders(this.config),
      body: JSON.stringify({ filenames: pathnames }),
    });
  };
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
class InstantAdminDatabase<Schema extends InstantSchemaDef<any, any, any>> {
  config: InstantConfigFilled<Schema>;
  auth: Auth;
  storage: Storage;
  impersonationOpts?: ImpersonationOpts;

  public tx = txInit<Schema>();

  constructor(_config: InstantConfig<Schema>) {
    this.config = instantConfigWithDefaults(_config);
    this.auth = new Auth(this.config);
    this.storage = new Storage(this.config);
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
  asUser = (opts: ImpersonationOpts): InstantAdminDatabase<Schema> => {
    const newClient = new InstantAdminDatabase<Schema>({
      ...this.config,
    });
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
  query = <Q extends InstaQLParams<Schema>>(
    query: Q,
  ): Promise<InstaQLResponse<Schema, Q>> => {
    return jsonFetch(`${this.config.apiURI}/admin/query`, {
      method: "POST",
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({
        query: query,
        "inference?": !!this.config.schema,
      }),
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
  transact = (
    inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  ) => {
    const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
    const steps = chunks.flatMap((tx) => getOps(tx));
    return jsonFetch(`${this.config.apiURI}/admin/transact`, {
      method: "POST",
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({
        steps: steps,
        "throw-on-missing-attrs?": !!this.config.schema,
      }),
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
  debugQuery = async <Q extends InstaQLParams<Schema>>(
    query: Q,
    opts?: { rules: any },
  ): Promise<{
    result: InstaQLResponse<Schema, Q>;
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
    inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
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

export {
  init,
  init_experimental,
  id,
  tx,
  lookup,
  i,

  // types
  type Config,
  type ImpersonationOpts,
  type TransactionChunk,
  type DebugCheckResult,
  type InstantAdmin,
  type InstantAdminDatabase,

  // core types
  type User,
  type InstaQLParams,
  type Query,

  // query types
  type QueryResponse,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantSchemaDatabase,
  type IInstantDatabase,
  type InstantObject,
  type InstantEntity,
  type BackwardsCompatibleSchema,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type ValueTypes,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type InstaQLEntity,
  type InstaQLResult,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
};
