import envPaths from 'env-paths';
import * as p from '@clack/prompts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { CliResults } from './cli.js';
import { randomUUID } from 'node:crypto';
import { fetchJson } from './utils/fetch.js';

const dev = Boolean(process.env.INSTANT_CLI_DEV);

function getAuthPaths() {
  const key = `instantdb-${dev ? 'dev' : 'prod'}`;
  const { config: appConfigDirPath } = envPaths(key);
  const authConfigFilePath = join(appConfigDirPath, 'a');

  return { authConfigFilePath, appConfigDirPath };
}

export const promptForAppName = async (program: CliResults) => {
  const title = await p
    .text({
      message: 'What would you like to call it?',
      placeholder: program.appName,
      defaultValue: program.appName,
      initialValue: program.appName,
    })
    .then((value) => {
      if (p.isCancel(value)) return program.appName;
      return value;
    });

  return title.trim();
};

export const createApp = async (title: string, authToken: string) => {
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token };
  const appRes = await fetchJson({
    method: 'POST',
    authToken,
    path: '/dash/apps',
    body: app,
  });
  return { appId: id, appToken: token, source: 'created' };
};

export const fetchApps = async (authToken: string) => {
  const res = await fetchJson<{
    apps: {
      id: string;
      title: string;
      created_at: string;
    }[];
  }>({
    method: 'GET',
    path: '/dash',
    authToken,
  });
  const { apps } = res;
  return apps;
};

export const tryConnectApp = async (
  program: CliResults,
): Promise<string | null> => {
  if (process.env.INSTANT_CLI_AUTH_TOKEN) {
    return process.env.INSTANT_CLI_AUTH_TOKEN;
  }

  const authToken = await readFile(
    getAuthPaths().authConfigFilePath,
    'utf-8',
  ).catch(() => null);

  if (!authToken) {
    return null;
  }

  // If doing ai generation
  if (program.prompt) {
    const { appId } = await createApp(program.appName, authToken);
    return appId;
  }

  const currentAppsPromise = fetchApps(authToken);

  const action = await p
    .select({
      message: `You are logged in already! ${chalk.bold('Create')} or ${chalk.bold('import')} existing app?`,
      options: [
        { value: 'create', label: `${chalk.bold('Create')} a new app` },
        { value: 'link', label: `${chalk.bold('Import')} an existing app` },
        { value: 'nothing', label: 'Create or import later' },
      ],
      initialValue: 'create' as 'create' | 'link' | 'nothing',
    })
    .then((value) => {
      if (p.isCancel(value)) return 'nothing';
      return value;
    });

  if (action === 'nothing') {
    return null;
  }
  if (action === 'create') {
    const title = await promptForAppName(program);
    p.log.success(`Creating app "${title}"`);
    const { appId } = await createApp(title, authToken);
    return appId;
  }

  if (action === 'link') {
    const apps = await currentAppsPromise;
    if (apps.length === 0) {
      return null;
    }

    apps.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    const choice = await p
      .select({
        message: 'Which app would you like to import?',
        options: apps.map((app) => {
          return { value: app.id, label: `${app.title} (${app.id})` };
        }),
        initialValue: apps[0]!.id,
      })
      .then((value) => {
        if (p.isCancel(value)) return null;
        return value;
      });

    return choice;
  }
  return null;
};
