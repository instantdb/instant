import envPaths from 'env-paths';
import * as p from '@clack/prompts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import openInBrowser from 'open';
import { join } from 'node:path';
import { Project, unwrapSkippablePrompt } from './cli.js';
import { randomUUID } from 'node:crypto';
import {
  fetchJson,
  instantBackendOrigin,
  instantDashOrigin,
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
) => {
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token, org_id: orgId };
  await fetchJson({
    method: 'POST',
    authToken,
    path: '/dash/apps',
    body: app,
  });
  return { appID: id, adminToken: token, source: 'created' };
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

const createPermissiveEphemeralApp = async (title: string) => {
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
  });
  return { appId: response.app.id, adminToken: response.app['admin-token'] };
};

export const tryConnectApp = async (
  project: Project,
): Promise<AppTokenResponse | null> => {
  let authToken = await getAuthToken();
  if (!authToken) {
    const choice = await renderUnwrap(
      new UI.Select({
        promptText: 'You are not logged in.',
        options: [
          {
            label: 'Create Temporary App',
            value: 'ephemeral',
          },
          {
            label: 'Login',
            value: 'login',
          },
          {
            label: 'Skip linking app',
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
      const app = await createPermissiveEphemeralApp(name);
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
          return createPermissiveEphemeralApp(title);
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
          );
          return { appId: appID, adminToken };
        },
      },
      modifyOutput: UI.ciaModifier(),
    }),
  );

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
