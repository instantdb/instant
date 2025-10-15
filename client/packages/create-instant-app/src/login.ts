import envPaths from 'env-paths';
import * as p from '@clack/prompts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { Project, unwrapSkippablePrompt } from './cli.js';
import { randomUUID } from 'node:crypto';
import { fetchJson } from './utils/fetch.js';
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
  appID: string;
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

const selectOrganization = async (
  orgs: Org[],
  message: string,
): Promise<string | null> => {
  const orgChoice = await unwrapSkippablePrompt(
    p.select<string | null>({
      message,
      options: [
        { value: null, label: '(No organization)' },
        ...orgs.map((org) => ({
          value: org.id,
          label: org.title,
        })),
      ],
      initialValue: null,
    }),
  );
  return orgChoice;
};

export const tryConnectApp = async (
  project: Project,
): Promise<AppTokenResponse | null> => {
  const authToken = await getAuthToken();
  if (!authToken) {
    return null;
  }

  let dashData = await fetchDashboard(authToken);
  const allowedOrgs = dashData.orgs.filter((org) => org.role !== 'app-member');
  dashData.orgs = allowedOrgs;
  const response = await renderUnwrap(
    new UI.AppSelector({
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
      modifyOutput: UI.ciaModifier,
    }),
  );

  console.log('response', response);

  return null;

  // // If doing ai generation
  // if (project.prompt) {
  //   if (authToken) {
  //     const dashData = await fetchDashboard(authToken);
  //     const allowedOrgs = dashData.orgs.filter(
  //       (org) => org.role !== 'app-member',
  //     );

  //     const orgId = allowedOrgs.length
  //       ? await selectOrganization(
  //           allowedOrgs,
  //           'Would you like to create the app in an organization?',
  //         )
  //       : null;

  //     const { appID, adminToken } = await createApp(
  //       project.appName,
  //       authToken,
  //       orgId,
  //     );
  //     return { appID, adminToken, approach: 'create' };
  //   }
  // }

  // if (!authToken) {
  //   const { appID, adminToken } = await createPermissiveEphemeralApp(
  //     project.appName,
  //   );
  //   p.log.success('Created ephemeral app and updated .env');
  //   return { appID, adminToken, approach: 'ephemeral' };
  // }

  // const dashData = await fetchDashboard(authToken);

  // const action = await unwrapSkippablePrompt(
  //   p.select({
  //     message: `You are logged in already! ${chalk.bold('Create')} or ${chalk.bold('import')} existing app?`,
  //     options: [
  //       { value: 'create', label: `${chalk.bold('Create')} a new app` },
  //       { value: 'link', label: `${chalk.bold('Import')} an existing app` },
  //       { value: 'nothing', label: 'Create or import later' },
  //     ],
  //     initialValue: 'create' as 'create' | 'link' | 'nothing',
  //   }),
  // );

  // if (action === 'nothing') {
  //   return null;
  // }

  // if (action === 'create') {
  //   const allowedOrgs = dashData.orgs.filter(
  //     (org) => org.role !== 'app-member',
  //   );

  //   const orgId = allowedOrgs.length
  //     ? await selectOrganization(
  //         allowedOrgs,
  //         'Would you like to create the app in an organization?',
  //       )
  //     : null;

  //   const title = await promptForAppName(project);
  //   p.log.success(`Creating app "${title}"`);
  //   const { appID, adminToken } = await createApp(title, authToken, orgId);
  //   return { appID, adminToken, approach: 'create' };
  // }

  // if (action === 'link') {
  //   const orgChoice = dashData.orgs.length
  //     ? await selectOrganization(
  //         dashData.orgs,
  //         'Would you like to import an app from an organization?',
  //       )
  //     : null;

  //   const { apps, orgId, orgName } = orgChoice
  //     ? await fetchOrganizationApps(authToken, orgChoice).then((orgData) => ({
  //         apps: orgData.apps,
  //         orgId: orgChoice,
  //         orgName: orgData.org.title,
  //       }))
  //     : { apps: dashData.apps, orgId: null, orgName: null };

  //   if (apps.length === 0) {
  //     if (orgId && orgName) {
  //       const ok = await unwrapSkippablePrompt(
  //         p.confirm({
  //           message: `You don't have any apps in ${orgName}. Want to create a new one?`,
  //           initialValue: true,
  //         }),
  //       );
  //       if (ok) {
  //         const title = await promptForAppName(project);
  //         p.log.success(`Creating app "${title}" in ${orgName}`);
  //         const { appID, adminToken } = await createApp(
  //           title,
  //           authToken,
  //           orgId,
  //         );
  //         return { appID, adminToken, approach: 'create' };
  //       }
  //     }
  //     return null;
  //   }

  //   apps.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  //   const choice = await unwrapSkippablePrompt(
  //     p.select({
  //       message: 'Which app would you like to import?',
  //       options: apps.map((app) => {
  //         return { value: app, label: `${app.title} (${app.id})` };
  //       }),
  //       initialValue: apps[0],
  //     }),
  //   );

  //   if (!choice) {
  //     return null;
  //   }
  //   return {
  //     adminToken: choice.admin_token,
  //     appID: choice.id,
  //     approach: 'import',
  //   };
  // }
  // return null;
};
