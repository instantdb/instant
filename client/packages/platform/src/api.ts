import {
  InstantAPIError,
  version as coreVersion,
  InstantRules,
} from '@instantdb/core';
import version from './version.js';
import { InstantAPIPlatformSchema } from './schema.ts';

type Simplify<T> = { [K in keyof T]: T[K] } & {};

async function jsonFetch<T = JSON>(
  input: RequestInfo,
  init: RequestInit | undefined,
): Promise<T> {
  const headers = {
    ...(init.headers || {}),
    'Instant-Platform-Version': version,
    'Instant-Core-Version': coreVersion,
  };
  const res = await fetch(input, { ...init, headers });
  if (res.status === 200) {
    const json = await res.json();
    return Promise.resolve(json);
  }
  const body = await res.text();
  try {
    const json = JSON.parse(body);
    return Promise.reject(
      new InstantAPIError({ status: res.status, body: json }),
    );
  } catch (_e) {
    return Promise.reject(
      new InstantAPIError({
        status: res.status,
        body: { type: undefined, message: body },
      }),
    );
  }
}

type AppDataOpts = {
  includePerms?: boolean | null | undefined;
  includeSchema?: boolean | null | undefined;
};

export type InstantAPIAppDetails<Opts extends AppDataOpts> = Simplify<
  {
    id: string;
    title: string;
    createdAt: Date;
  } & (Opts['includePerms'] extends true ? { perms: InstantRules } : {}) &
    (Opts['includeSchema'] extends true
      ? { schema: InstantAPIPlatformSchema }
      : {})
>;

export type InstantAPIGetAppResponse<Opts extends AppDataOpts> = {
  app: InstantAPIAppDetails<Opts>;
};

export type InstantAPIListAppsResponse<Opts extends AppDataOpts> = {
  apps: InstantAPIAppDetails<Opts>[];
};

async function getApps<Opts extends AppDataOpts>(
  apiOrigin: string,
  token: string,
  opts?: Opts,
): Promise<InstantAPIListAppsResponse<Opts>> {
  const url = new URL(`${apiOrigin}/superadmin/apps`);
  const include = [];
  if (opts?.includePerms) {
    include.push('perms');
  }
  if (opts?.includeSchema) {
    include.push('schema');
  }

  if (include.length) {
    url.searchParams.set('include', include.join(','));
  }
  return await jsonFetch<InstantAPIListAppsResponse<typeof opts>>(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

async function test() {
  const x = await getApps('a', 'b', { includePerms: true });

  const app = x.apps[0]!;
  const id = app.id;
  const perms = app.perms;
}

async function getAppSchema(apiOrigin: string, token: string, appId: string) {
  return await jsonFetch(`${apiOrigin}/superadmin/app/${appId}/schema`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function getAppPerms(apiOrigin: string, token: string, appId: string) {
  return await jsonFetch(`${apiOrigin}/superadmin/app/${appId}/perms`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function getApp<Opts extends AppDataOpts>(
  apiOrigin: string,
  token: string,
  appId: string,
  opts?: Opts,
): Promise<InstantAPIGetAppResponse<Opts>> {
  let permsPromise;
  let schemaPromise;
  if (opts?.includePerms) {
    permsPromise = getAppPerms(apiOrigin, token, appId);
  }
  if (opts?.includeSchema) {
    schemaPromise = getAppSchema(apiOrigin, token, appId);
  }

  const res = await jsonFetch<InstantAPIGetAppResponse<typeof opts>>(
    `${apiOrigin}/superadmin/apps/${appId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!permsPromise && !schemaPromise) {
    return res;
  }

  return {
    ...res,
    app: {
      ...res.app,
      ...(permsPromise ? { perms: (await permsPromise).perms } : {}),
      ...(schemaPromise ? { schema: (await schemaPromise).schema } : {}),
    },
  };
}

async function test2() {
  const data = await getApp('', '', '', { includeSchema: false });
  const app = data.app;
  // Property 'schema' does not exist on type '{ id: string; title: string; createdAt: Date; }'.ts(2339)
  app.schema;

  const data2 = await getApp('', '', '', { includeSchema: true });
  const app2 = data2.app;
  app2.schema;
}
