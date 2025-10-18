import envPaths from 'env-paths';
import * as p from '@clack/prompts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Project, unwrapSkippablePrompt } from './cli.js';
import { randomUUID } from 'node:crypto';
import { fetchJson } from './utils/fetch.js';
import { renderUnwrap, UI } from 'instant-cli/ui';
import { createInterface } from 'node:readline';

const dev = Boolean(process.env.INSTANT_CLI_DEV);
const forceEphemeral = Boolean(process.env.INSTANT_CLI_FORCE_EPHEMERAL);
const noBrowserMode = Boolean(process.env.INSTANT_CLI_NO_BROWSER || process.env.CI);

function isHeadlessEnvironment(): boolean {
  // Check for common headless environment indicators
  return (
    noBrowserMode ||
    process.env.TERM === 'dumb' ||
    process.env.SSH_CONNECTION !== undefined ||
    process.env.SSH_CLIENT !== undefined ||
    !process.env.DISPLAY && process.platform === 'linux' ||
    process.env.WSL_DISTRO_NAME !== undefined
  );
}

async function waitForUserInput(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function initiateHeadlessLogin(): Promise<string | null> {
  try {
    const registerRes = await fetchJson<{
      secret: string;
      ticket: string;
    }>({
      method: 'POST',
      path: '/dash/cli/auth/register',
      authToken: null,
      body: {},
    });

      if (!registerRes) {
      console.error('Failed to register login request');
      return null;
    }

    const { secret, ticket } = registerRes;
    const instantDashOrigin = dev
      ? 'http://localhost:3000'
      : 'https://instantdb.com';
    const authUrl = `${instantDashOrigin}/dash?ticket=${ticket}`;

    console.log(`Please open the following URL in your browser to authenticate:`);
    console.log(`\n${authUrl}\n`);
    console.log('After you have completed authentication in your browser');

    await waitForUserInput('\nPress Enter to continue...');

    console.log('Waiting for authentication to complete...');

    // Wait for authentication to complete (similar to CLI logic)
    for (let i = 1; i <= 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const authCheckRes = await fetchJson<{
        token: string;
        email: string;
        data?: {
          hint?: {
            errors?: Array<{issue?: string}>;
          };
        };
      }>({
        method: 'POST',
        path: '/dash/cli/auth/check',
        body: { secret },
        authToken: null,
      });

      if (authCheckRes) {
        const { token, email } = authCheckRes;
        console.log(`\n✅ Successfully authenticated as ${email}!`);
        return token;
      }

      if (i % 10 === 0) {
        console.log(`Still waiting for authentication... (${i}/120 seconds)`);
      }
    }

    console.error('\n❌ Authentication timed out. Please try again.');
    return null;
  } catch (error) {
    console.error('❌ Failed to initiate headless login:', error);
    return null;
  }
}

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

  if (authToken) {
    return authToken;
  }

  // If no auth token found and we're in a headless environment, try headless login
  if (isHeadlessEnvironment()) {
    console.log('\n🔐 No authentication token found.');
    const shouldAttemptLogin = await renderUnwrap(
      new UI.Select({
        promptText: 'How would you like to authenticate?',
        options: [
          {
            label: 'Login with URL in browser (recommended)',
            value: 'headless',
          },
          {
            label: 'Create temporary app',
            value: 'ephemeral',
          },
          {
            label: 'Skip authentication',
            value: 'skip',
          },
        ],
        modifyOutput: UI.ciaModifier(),
      }),
    );

    if (shouldAttemptLogin === 'headless') {
      return await initiateHeadlessLogin();
    } else if (shouldAttemptLogin === 'ephemeral' || shouldAttemptLogin === 'skip') {
      return null;
    }
  }

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
  const authToken = await getAuthToken();
  if (!authToken) {
    // If we're in a headless environment, the user has already been prompted
    // in getAuthToken(), so just create ephemeral app
    if (isHeadlessEnvironment()) {
      const app = await createPermissiveEphemeralApp(project.appName);
      return { ...app, approach: 'ephemeral' };
    }

    // For desktop environments, show the original flow
    const choice = await renderUnwrap(
      new UI.Select({
        promptText: 'You are not logged in.',
        options: [
          {
            label: 'Create Temporary App',
            value: 'ephemeral',
          },
          {
            label: 'Skip linking app',
            value: 'skip',
          },
        ],
        modifyOutput: UI.ciaModifier(),
      }),
    );

    if (choice === 'skip') {
      UI.log('Skipping app link step', UI.ciaModifier(null));
      return null;
    }

    if (choice === 'ephemeral') {
      const name = await renderUnwrap(
        new UI.TextInput({
          prompt: 'Enter a name for your temporary app:',
          placeholder: `my-cool-app`,
          modifyOutput: UI.ciaModifier(),
        }),
      );
      const app = await createPermissiveEphemeralApp(name);
      return { ...app, approach: 'ephemeral' };
    }

    return null;
  }

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
