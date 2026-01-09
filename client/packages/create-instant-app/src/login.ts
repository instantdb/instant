import envPaths from 'env-paths';
import * as p from '@clack/prompts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import openInBrowser from 'open';
import { join } from 'node:path';
import { AppFlags, Project, unwrapSkippablePrompt } from './cli.js';
import { randomUUID } from 'node:crypto';
import {
  fetchJson,
  instantBackendOrigin,
  instantDashOrigin,
  ScaffoldMetadata,
} from './utils/fetch.js';
import { renderUnwrap, UI } from 'instant-cli/ui';

const dev = Boolean(process.env.INSTANT_CLI_DEV);
const forceEphemeral = Boolean(process.env.INSTANT_CLI_FORCE_EPHEMERAL);

function getAuthPaths() {
  const key = `instantdb-${dev ? 'dev' : 'prod'}`;
  const { config: appConfigDirPath } = envPaths(key);
  const authConfigFilePath = join(appConfigDirPath, 'a');

  return { authConfigFilePath, appConfigDirPath };
}

export const promptForAppName = async (program: Project) => {
  const title = await unwrapSkippablePrompt(
    p.text({
      message: 'What would you like to call it?',
      placeholder: program.appName,
      defaultValue: program.appName,
      initialValue: program.appName,
    }),
  );

  return title.trim();
};

export const createApp = async (
  title: string,
  authToken: string,
  orgId?: string | null,
  metadata?: ScaffoldMetadata,
) => {
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token, org_id: orgId };
  await fetchJson({
    method: 'POST',
    authToken,
    path: '/dash/apps',
    body: app,
    metadata,
  });
  return { appID: id, adminToken: token, source: 'created' };
};

/**
 * Fire-and-forget tracking for when a user imports/links an existing app.
 * Captures user info if authenticated, scaffold metadata for analytics.
 */
const trackAppImport = (
  appId: string,
  authToken: string | null,
  metadata?: ScaffoldMetadata,
) => {
  fetchJson({
    method: 'POST',
    path: `/dash/apps/${appId}/track-import`,
    authToken,
    metadata,
  }).catch(() => {});
};

type App = {
  admin_token: string;
  magic_code_email_template: null;
  id: string;
  title: string;
  created_at: string;
};

type Org = {
  id: string;
  title: string;
  role: string;
};

export const fetchDashboard = async (authToken: string) => {
  const res = await fetchJson<{
    apps: App[];
    orgs: Org[];
  }>({
    method: 'GET',
    path: '/dash',
    authToken,
  });
  return res;
};

export const fetchOrganizationApps = async (
  authToken: string,
  orgId: string,
) => {
  const res = await fetchJson<{
    apps: App[];
    org: {
      id: string;
      title: string;
    };
  }>({
    method: 'GET',
    path: `/dash/orgs/${orgId}`,
    authToken,
  });
  return res;
};

export const fetchApps = async (authToken: string) => {
  const res = await fetchDashboard(authToken);
  return res.apps;
};

export const verifyAppAccess = async (
  authToken: string,
  appId: string,
): Promise<{ appId: string; adminToken: string } | null> => {
  try {
    const dashData = await fetchDashboard(authToken);

    // Check personal apps
    const personalApp = dashData.apps.find((app) => app.id === appId);
    if (personalApp) {
      return { appId: personalApp.id, adminToken: personalApp.admin_token };
    }

    // Check org apps
    for (const org of dashData.orgs) {
      const { apps } = await fetchOrganizationApps(authToken, org.id);
      const orgApp = apps.find((app) => app.id === appId);
      if (orgApp) {
        return { appId: orgApp.id, adminToken: orgApp.admin_token };
      }
    }

    return null;
  } catch {
    return null;
  }
};

export const verifyAppIdAndToken = async (
  appId: string,
  token: string,
): Promise<boolean> => {
  try {
    // Verify the token works for this app by pulling schema
    await fetchJson<any>({
      method: 'GET',
      path: `/dash/apps/${appId}/schema/pull`,
      authToken: token,
    });
    return true;
  } catch {
    return false;
  }
};

const getAuthToken = async (): Promise<string | null> => {
  if (forceEphemeral) {
    return null;
  }
  if (process.env.INSTANT_CLI_AUTH_TOKEN) {
    return process.env.INSTANT_CLI_AUTH_TOKEN;
  }

  const authToken = await readFile(
    getAuthPaths().authConfigFilePath,
    'utf-8',
  ).catch(() => null);
  return authToken;
};

type AppTokenResponse = {
  appId: string;
  adminToken: string;
  approach: 'ephemeral' | 'import' | 'create';
};

const createPermissiveEphemeralApp = async (
  title: string,
  metadata?: ScaffoldMetadata,
) => {
  const response = await fetchJson<{
    app: { id: string; 'admin-token': string };
  }>({
    authToken: null,
    method: 'POST',
    path: '/dash/apps/ephemeral',
    body: {
      title,
      rules: {
        $users: {
          view: 'true',
        },
        $files: {
          allow: {
            view: 'true',
            create: 'true',
            delete: 'true',
          },
        },
      },
    },
    metadata,
  });
  return { appId: response.app.id, adminToken: response.app['admin-token'] };
};

export const tryConnectApp = async (
  appFlags?: AppFlags,
  metadata?: ScaffoldMetadata,
): Promise<AppTokenResponse | null> => {
  let authToken = await getAuthToken();

  // Handle --app flag: skip interactive selection
  if (appFlags?.app) {
    // If token is provided via --token flag, verify and use it
    if (appFlags.token) {
      const isValid = await verifyAppIdAndToken(appFlags.app, appFlags.token);
      if (!isValid) {
        throw new Error(
          `Invalid app ID and token combination. Please verify both the app ID and token are correct.`,
        );
      }
      UI.log(`Linking to app: ${appFlags.app}`, UI.ciaModifier(null));
      trackAppImport(appFlags.app, appFlags.token, metadata);
      return {
        appId: appFlags.app,
        adminToken: appFlags.token,
        approach: 'import',
      };
    }

    // If no token provided but user is logged in, look up the admin token
    if (authToken) {
      const appAccess = await verifyAppAccess(authToken, appFlags.app);
      if (!appAccess) {
        throw new Error(
          `You don't have access to app "${appFlags.app}". Please check the app ID or use --token to provide a token.`,
        );
      }
      UI.log(`Linking to app: ${appFlags.app}`, UI.ciaModifier(null));
      trackAppImport(appAccess.appId, authToken, metadata);
      return {
        appId: appAccess.appId,
        adminToken: appAccess.adminToken,
        approach: 'import',
      };
    }

    // No token and not logged in - error
    throw new Error(
      `You must be logged in or provide --token when using --app. ` +
        `Either run 'npx instant-cli login' first, or use: --app ${appFlags.app} --token <token>`,
    );
  }

  if (!authToken) {
    const choice = await renderUnwrap(
      new UI.Select({
        promptText: 'You are not logged in.',
        options: [
          {
            label: 'Create temporary app',
            value: 'ephemeral',
          },
          {
            label: 'Login to choose existing app',
            value: 'login',
          },
          {
            label: 'Create app later',
            value: 'skip',
          },
        ],
        modifyOutput: UI.ciaModifier(),
      }),
    );

    if (choice === 'login') {
      const registerRes = await fetchJson<any>({
        authToken: null,
        method: 'POST',
        path: '/dash/cli/auth/register',
      });
      const { secret, ticket } = registerRes;
      openInBrowser(`${instantDashOrigin}/dash?ticket=${ticket}`);

      const tokenPromise = waitForAuthToken({
        secret: secret,
      });

      const authInfo = await renderUnwrap(
        new UI.Spinner({
          promise: tokenPromise,
          workingText: 'Waiting for login in browser',
          disappearWhenDone: true,
          modifyOutput: UI.ciaModifier(null),
        }),
      );

      await saveConfigAuthToken(authInfo.token);
      authToken = authInfo.token;
    }

    if (choice === 'skip') {
      UI.log('Skipping app link step', UI.ciaModifier(null));
      return null;
    }

    if (choice === 'ephemeral') {
      const name = await renderUnwrap(
        new UI.TextInput({
          defaultValue: 'my-cool-app',
          prompt: 'Enter a name for your temporary app:',
          placeholder: `my-cool-app`,
          modifyOutput: UI.ciaModifier(),
        }),
      );
      const app = await createPermissiveEphemeralApp(name, metadata);
      return { ...app, approach: 'ephemeral' };
    }
  }

  if (!authToken) return null;

  let dashData = await fetchDashboard(authToken);
  const allowedOrgs = dashData.orgs.filter((org) => org.role !== 'app-member');
  dashData.orgs = allowedOrgs;
  const selectedApp = await renderUnwrap(
    new UI.AppSelector({
      startingMenuIndex: 0,
      allowCreate: true,
      allowEphemeral: true,
      api: {
        getDash() {
          return dashData;
        },

        createEphemeralApp(title) {
          return createPermissiveEphemeralApp(title, metadata);
        },

        getAppsForOrg: async (orgId: string) => {
          const { apps } = await fetchOrganizationApps(authToken, orgId);
          return { apps };
        },

        createApp: async (title: string, orgId?: string) => {
          const { appID, adminToken } = await createApp(
            title,
            authToken,
            orgId,
            metadata,
          );
          return { appId: appID, adminToken };
        },
      },
      modifyOutput: UI.ciaModifier(),
    }),
  );

  if (selectedApp?.approach === 'import') {
    trackAppImport(selectedApp.appId, authToken, metadata);
  }

  return selectedApp;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForAuthToken({
  secret,
}: {
  secret: string;
}): Promise<{ token: string; email: string }> {
  for (let i = 1; i <= 120; i++) {
    await sleep(1000);

    const authCheckRes = await fetch(
      `${instantBackendOrigin}/dash/cli/auth/check`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ secret }),
      },
    );

    if (!authCheckRes.ok) {
      const body = await authCheckRes.json();
      if (body.hint.errors?.[0]?.issue === 'waiting-for-user') {
        continue;
      }
    }

    if (authCheckRes.ok) {
      return authCheckRes.json();
    }

    // if (authCheckRes.data?.hint.errors?.[0]?.issue === 'waiting-for-user') {
    //   continue;
    // }
  }
  throw new Error('Timed out waiting for login');
}

async function saveConfigAuthToken(authToken: string) {
  const authPaths = getAuthPaths();

  await mkdir(authPaths.appConfigDirPath, {
    recursive: true,
  });

  return writeFile(authPaths.authConfigFilePath, authToken, 'utf-8');
}
