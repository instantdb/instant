import { Effect } from 'effect';
import { CurrentAppInfo, potentialEnvs } from '../context/currentApp.js';
import { ProjectInfo, ProjectInfoError } from '../context/projectInfo.js';
import { readPackage } from 'pkg-types';
import { GlobalOpts } from '../context/globalOpts.js';
import { FileSystem, Path } from '@effect/platform';
import chalk from 'chalk';
import terminalLink from 'terminal-link';
import { getDashUrl } from './http.js';
import { promptOk } from './ui.js';

export const handleEnv = Effect.fn(function* (app: CurrentAppInfo) {
  const opts = yield* GlobalOpts;
  const { pkgDir } = yield* ProjectInfo;
  const envType = yield* detectEnvType;
  const envName = potentialEnvs[envType];
  const envFile = opts.env ?? '.env';
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hasEnvFile = yield* fs.exists(path.join(pkgDir, envFile));
  const dashOrigin = yield* getDashUrl;
  if (hasEnvFile) {
    return printDotEnvInfo(envType, app.appId, dashOrigin);
  }
  console.log(
    `\nLooks like you don't have a ${chalk.green(`\`${envFile}\``)} file yet.`,
  );
  console.log(
    `If we set ${chalk.green(envName)} & ${chalk.green('INSTANT_APP_ADMIN_TOKEN')}, we can remember the app that you chose for all future commands.`,
  );
  const saveExtraInfo =
    envFile !== '.env' ? chalk.green('  (will create `' + envFile + '`)') : '';

  const ok = yield* promptOk(
    {
      inline: true,
      promptText: 'Want us to create this env file for you?' + saveExtraInfo,
      modifyOutput: (a) => a,
    },
    true,
  );
  if (!ok) {
    console.log(
      `No .env file created. You can always set ${chalk.green('`' + envName + '`')} later. \n`,
    );
    return;
  }
  const content =
    [
      [envName, app.appId],
      ['INSTANT_APP_ADMIN_TOKEN', app.adminToken],
    ]
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';

  yield* fs.writeFileString(path.join(pkgDir, envFile), content);

  if (envFile !== '.env') {
    console.log(`Created ${chalk.green(envFile)}!`);
  } else {
    console.log(`Created ${chalk.green('.env')} file!`);
  }
});

const detectEnvType = Effect.gen(function* () {
  const pkgJson = yield* Effect.tryPromise({
    try: () => readPackage(),
    catch: () =>
      new ProjectInfoError({ message: "Couldn't read package.json" }),
  });
  if (pkgJson.dependencies?.next) {
    return 'next';
  }
  if (pkgJson.devDependencies?.svelte) {
    return 'svelte';
  }
  if (pkgJson.devDependencies?.vite) {
    return 'vite';
  }
  if (pkgJson.dependencies?.expo) {
    return 'expo';
  }
  if (pkgJson.dependencies?.nuxt) {
    return 'nuxt';
  }
  return 'catchall';
}).pipe(Effect.catchTag('ProjectInfoError', () => Effect.succeed('catchall')));

function printDotEnvInfo(envType, appId, dashOrigin: string) {
  console.log(`\nPicked app ${chalk.green(appId)}!\n`);
  console.log(
    `To use this app automatically from now on, update your ${chalk.green('`.env`')} file:`,
  );
  const picked = potentialEnvs[envType];
  const rest = { ...potentialEnvs };
  delete rest[envType];
  console.log(`  ${chalk.green(picked)}=${appId}`);
  const otherEnvs = Object.values(rest);
  otherEnvs.sort();
  const otherEnvStr = otherEnvs.map((x) => '  ' + chalk.green(x)).join('\n');
  console.log(`Alternative names: \n${otherEnvStr} \n`);
  console.log(terminalLink('Dashboard:', appDashUrl(appId, dashOrigin)) + '\n');
}

function appDashUrl(id, instantOrigin: string) {
  return `${instantOrigin}/dash?s=main&t=home&app=${id}`;
}
