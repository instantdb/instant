// @ts-check
import {
  generatePermsTypescriptFile,
  apiSchemaToInstantSchemaDef,
  generateSchemaTypescriptFile,
  diffSchemas,
  convertTxSteps,
  validateSchema,
  SchemaValidationError,
} from '@instantdb/platform';
import version from './version.js';
import { existsSync } from 'fs';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import path, { join } from 'path';
import { randomUUID } from 'crypto';
import jsonDiff from 'json-diff';
import chalk from 'chalk';
import { program, Option } from 'commander';
import boxen from 'boxen';
import { loadConfig } from './util/loadConfig.js';
import { packageDirectory } from 'pkg-dir';
import openInBrowser from 'open';
import terminalLink from 'terminal-link';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  detectPackageManager,
  getInstallCommand,
} from './util/packageManager.js';
import { pathExists, readJsonFile } from './util/fs.js';
import prettier from 'prettier';
import {
  CancelSchemaError,
  groupSteps,
  renderSchemaPlan,
} from './renderSchemaPlan.js';
import { getAuthPaths } from './util/getAuthPaths.js';
import { renderUnwrap } from './ui/lib.js';
import { UI } from './ui/index.js';
import { deferred } from './ui/lib.js';
import { promptOk } from './util/promptOk.js';
import { ResolveRenamePrompt } from './util/renamePrompt.js';
import { buildAutoRenameSelector } from './rename.js';
import { loadEnv } from './util/loadEnv.js';
import { isHeadlessEnvironment } from './util/isHeadlessEnvironment.js';

const execAsync = promisify(exec);

loadEnv();

const dev = Boolean(process.env.INSTANT_CLI_DEV);
const verbose = Boolean(process.env.INSTANT_CLI_VERBOSE);

// logs

function warn(firstArg, ...rest) {
  console.warn(chalk.yellow('[warning]') + ' ' + firstArg, ...rest);
}

function error(firstArg, ...rest) {
  console.error(chalk.red('[error]') + ' ' + firstArg, ...rest);
}

// json response

const toJson = (data) => JSON.stringify(data, null, 2);

// consts

const potentialEnvs = {
  catchall: 'INSTANT_APP_ID',
  next: 'NEXT_PUBLIC_INSTANT_APP_ID',
  svelte: 'PUBLIC_INSTANT_APP_ID',
  vite: 'VITE_INSTANT_APP_ID',
  expo: 'EXPO_PUBLIC_INSTANT_APP_ID',
  nuxt: 'NUXT_PUBLIC_INSTANT_APP_ID',
};

const potentialAdminTokenEnvs = {
  default: 'INSTANT_APP_ADMIN_TOKEN',
  short: 'INSTANT_ADMIN_TOKEN',
};

async function detectEnvType({ pkgDir }) {
  const packageJSON = await getPackageJson(pkgDir);
  if (!packageJSON) {
    return 'catchall';
  }
  if (packageJSON.dependencies?.next) {
    return 'next';
  }
  if (packageJSON.devDependencies?.svelte) {
    return 'svelte';
  }
  if (packageJSON.devDependencies?.vite) {
    return 'vite';
  }
  if (packageJSON.dependencies?.expo) {
    return 'expo';
  }
  if (packageJSON.dependencies?.nuxt) {
    return 'nuxt';
  }
  return 'catchall';
}

const instantDashOrigin = dev
  ? 'http://localhost:3000'
  : 'https://instantdb.com';

const instantBackendOrigin =
  process.env.INSTANT_CLI_API_URI ||
  (dev ? 'http://localhost:8888' : 'https://api.instantdb.com');

const PUSH_PULL_OPTIONS = new Set(['schema', 'perms', 'all']);

function convertArgToBagWithErrorLogging(arg) {
  if (!arg) {
    return { ok: true, bag: 'all' };
  } else if (PUSH_PULL_OPTIONS.has(arg.trim().toLowerCase())) {
    return { ok: true, bag: arg };
  } else {
    error(
      `${chalk.red(arg)} is not valid. Must be one of ${chalk.green(Array.from(PUSH_PULL_OPTIONS).join(', '))}`,
    );
    return { ok: false };
  }
}

function convertPushPullToCurrentFormat(arg, opts) {
  const { ok, bag } = convertArgToBagWithErrorLogging(arg);
  if (!ok) return { ok: false };
  return { ok: true, bag, opts };
}

async function packageDirectoryWithErrorLogging() {
  const pkgDir = await packageDirectory();
  if (!pkgDir) {
    error("Couldn't find your root directory. Is there a package.json file?");
    return;
  }
  return pkgDir;
}

// cli

// Header -- this shows up in every command
const logoChalk = chalk.bold('instant-cli');
const versionChalk = chalk.dim(`${version.trim()}`);
const headerChalk = `${logoChalk} ${versionChalk} ` + '\n';

// Help Footer -- this only shows up in help commands
const helpFooterChalk =
  '\n' +
  chalk.dim.bold('Want to learn more?') +
  '\n' +
  `Check out the docs: ${chalk.blueBright.underline('https://instantdb.com/docs')}
Join the Discord:   ${chalk.blueBright.underline('https://discord.com/invite/VU53p7uQcE')}
`.trim();

program.addHelpText('after', helpFooterChalk);

program.addHelpText('beforeAll', headerChalk);

function getLocalAndGlobalOptions(cmd, helper) {
  const mixOfLocalAndGlobal = helper.visibleOptions(cmd);
  const localOptionsFromMix = mixOfLocalAndGlobal.filter(
    (option) => !option.__global,
  );
  const globalOptionsFromMix = mixOfLocalAndGlobal.filter(
    (option) => option.__global,
  );
  const globalOptions = helper.visibleGlobalOptions(cmd);

  return [localOptionsFromMix, globalOptionsFromMix.concat(globalOptions)];
}

// custom `formatHelp`
// original: https://github.com/tj/commander.js/blob/master/lib/help.js
function formatHelp(cmd, helper) {
  const termWidth = helper.padWidth(cmd, helper);
  const helpWidth = helper.helpWidth || 80;
  const itemIndentWidth = 2;
  const itemSeparatorWidth = 2; // between term and description
  function formatItem(term, description) {
    if (description) {
      const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
      return helper.wrap(
        fullText,
        helpWidth - itemIndentWidth,
        termWidth + itemSeparatorWidth,
      );
    }
    return term;
  }
  function formatList(textArray) {
    return textArray.join('\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
  }

  // Usage
  let output = [`${helper.commandUsage(cmd)}`, ''];

  // Description
  const commandDescription = helper.commandDescription(cmd);
  if (commandDescription.length > 0) {
    output = output.concat([helper.wrap(commandDescription, helpWidth, 0), '']);
  }

  // Arguments
  const argumentList = helper.visibleArguments(cmd).map((argument) => {
    return formatItem(
      helper.argumentTerm(argument),
      helper.argumentDescription(argument),
    );
  });
  if (argumentList.length > 0) {
    output = output.concat([
      chalk.dim.bold('Arguments'),
      formatList(argumentList),
      '',
    ]);
  }
  const [visibleOptions, visibleGlobalOptions] = getLocalAndGlobalOptions(
    cmd,
    helper,
  );

  // Options
  const optionList = visibleOptions.map((option) => {
    return formatItem(
      helper.optionTerm(option),
      helper.optionDescription(option),
    );
  });
  if (optionList.length > 0) {
    output = output.concat([
      chalk.dim.bold('Options'),
      formatList(optionList),
      '',
    ]);
  }
  // Commands
  const commandList = helper.visibleCommands(cmd).map((cmd) => {
    return formatItem(
      helper.subcommandTerm(cmd),
      helper.subcommandDescription(cmd),
    );
  });
  if (commandList.length > 0) {
    output = output.concat([
      chalk.dim.bold('Commands'),
      formatList(commandList),
      '',
    ]);
  }

  if (this.showGlobalOptions) {
    const globalOptionList = visibleGlobalOptions.map((option) => {
      return formatItem(
        helper.optionTerm(option),
        helper.optionDescription(option),
      );
    });
    if (globalOptionList.length > 0) {
      output = output.concat([
        chalk.dim.bold('Global Options'),
        formatList(globalOptionList),
        '',
      ]);
    }
  }

  return output.join('\n');
}

program.configureHelp({
  showGlobalOptions: true,
  formatHelp,
});

function globalOption(flags, description, argParser) {
  const opt = new Option(flags, description);
  if (argParser) {
    opt.argParser(argParser);
  }
  // @ts-ignore
  // __global does not exist on `Option`,
  // but we use it in `getLocalAndGlobalOptions`, to produce
  // our own custom list of local and global options.
  // For more info, see the original PR:
  // https://github.com/instantdb/instant/pull/505
  opt.__global = true;
  return opt;
}

function warnDeprecation(oldCmd, newCmd) {
  warn(
    chalk.yellow('`instant-cli ' + oldCmd + '` is deprecated.') +
      ' Use ' +
      chalk.green('`instant-cli ' + newCmd + '`') +
      ' instead.' +
      '\n',
  );
}

program
  .name('instant-cli')
  .addOption(globalOption('-t --token <token>', 'Auth token override'))
  .addOption(globalOption('-y --yes', "Answer 'yes' to all prompts"))
  .addOption(globalOption('--env <file>', 'Use a specific .env file'))
  .addOption(
    globalOption('-v --version', 'Print the version number', () => {
      console.log(version);
      process.exit(0);
    }),
  )
  .addHelpOption(globalOption('-h --help', 'Print the help text for a command'))
  .usage(`<command> ${chalk.dim('[options] [args]')}`);

program
  .command('login')
  .description('Log into your account')
  .option('-p --print', 'Prints the auth token into the console.')
  .option(
    '--headless',
    'Print the login URL instead of trying to open the browser',
  )
  .action(async (opts) => {
    console.log("Let's log you in!");
    await login(opts);
  });

program
  .command('logout')
  .description('Log out of your Instant account')
  .action(async () => {
    await logout();
  });

program
  .command('init')
  .description('Set up a new project.')
  .option(
    '-a --app <app-id>',
    'If you have an existing app ID, we can pull schema and perms from there.',
  )
  .option(
    '-p --package <react|react-native|core|admin>',
    'Which package to automatically install if there is not one installed already.',
  )
  .option('-t --title <title>', 'Title for the created app')
  .action(handleInit);

program
  .command('init-without-files')
  .description('Generate a new app id and admin token pair without any files.')
  .option('--title <title>', 'Title for the created app.')
  .option(
    '--org-id <org-id>',
    'Organization id for app. Cannot be used with --temp flag.',
  )
  .option(
    '--temp',
    'Create a temporary app which will automatically delete itself after >24 hours.',
  )
  .action(handleInitWithoutFiles);

// Note: Nov 20, 2024
// We can eventually delete this,
// once we know most people use the new pull and push commands
program
  .command('push-schema', { hidden: true })
  .argument('[app-id]')
  .description('Push schema to production.')
  .option(
    '--skip-check-types',
    "Don't check types on the server when pushing schema",
  )
  .action(async (appIdOrName, opts) => {
    warnDeprecation('push-schema', 'push schema');
    await handlePush('schema', { app: appIdOrName, ...opts });
  });

// Note: Nov 20, 2024
// We can eventually delete this,
// once we know most people use the new pull and push commands
program
  .command('push-perms', { hidden: true })
  .argument('[app-id]')
  .description('Push perms to production.')
  .action(async (appIdOrName) => {
    warnDeprecation('push-perms', 'push perms');
    await handlePush('perms', { app: appIdOrName });
  });

program
  .command('push')
  .argument(
    '[schema|perms|all]',
    'Which configuration to push. Defaults to `all`',
  )
  .option(
    '-a --app <app-id>',
    'App ID to push too. Defaults to *_INSTANT_APP_ID in .env',
  )
  .option(
    '--skip-check-types',
    "Don't check types on the server when pushing schema",
  )
  .option('-t --title', 'Title for the created app')
  .option(
    '--rename [renames...]',
    'List of full attribute names separated by a ":"\n Example:`push --rename posts.author:posts.creator stores.owner:stores.manager`',
  )
  .option(
    '-p --package <react|react-native|core|admin>',
    'Which package to automatically install if there is not one installed already.',
  )
  .description('Push schema and perm files to production.')
  .action(async function (arg, inputOpts) {
    const ret = convertPushPullToCurrentFormat(arg, inputOpts);
    if (!ret.ok) return process.exit(1);
    const { bag, opts } = ret;
    await handlePush(bag, opts);
  });

// Note: Nov 20, 2024
// We can eventually delete this,
// once we know most people use the new pull and push commands
program
  .command('pull-schema', { hidden: true })
  .argument('[app-id]')
  .description('Generate instant.schema.ts from production')
  .action(async (appIdOrName) => {
    warnDeprecation('pull-schema', 'pull schema');
    await handlePull('schema', { app: appIdOrName });
  });

// Note: Nov 20, 2024
// We can eventually delete this,
// once we know most people use the new pull and push commands
program
  .command('pull-perms', { hidden: true })
  .argument('[app-id]')
  .description('Generate instant.perms.ts from production.')
  .action(async (appIdOrName) => {
    warnDeprecation('pull-perms', 'pull perms');
    await handlePull('perms', { app: appIdOrName });
  });

program
  .command('pull')
  .argument(
    '[schema|perms|all]',
    'Which configuration to push. Defaults to `all`',
  )
  .option(
    '-a --app <app-id>',
    'App ID to push to. Defaults to *_INSTANT_APP_ID in .env',
  )
  .option('-t --title', 'Title for the created app')
  .option(
    '-p --package <react|react-native|core|admin>',
    'Which package to automatically install if there is not one installed already.',
  )
  .description('Pull schema and perm files from production.')
  .action(async function (arg, inputOpts) {
    const ret = convertPushPullToCurrentFormat(arg, inputOpts);
    if (!ret.ok) return process.exit(1);
    const { bag, opts } = ret;
    await handlePull(bag, opts);
  });

program
  .command('claim')
  .description('Transfer a tempoary app into your Instant account')
  .action(async function () {
    const token = await readConfigAuthToken(false);
    if (!token) {
      console.error(
        `Please log in first with ${chalk.bgGray.white('instant-cli login')} to claim an app`,
      );
      process.exit(1);
    }

    const envResult = detectAppIdAndAdminTokenFromEnvWithErrorLogging();
    if (!envResult.ok) return process.exit(1);

    if (!envResult.appId) {
      error('No app ID found in environment variables.');
      return process.exit(1);
    }

    if (!envResult.adminToken) {
      error('No admin token found in environment variables.');
      return process.exit(1);
    }

    const appId = envResult.appId.value;
    const adminToken = envResult.adminToken.value;

    console.log(`Found ${chalk.green(envResult.appId.envName)}: ${appId}`);

    await claimEphemeralApp(appId, adminToken);
  });

program.parse(process.argv);

async function handleInit(opts) {
  const pkgAndAuthInfo =
    await getOrPromptPackageAndAuthInfoWithErrorLogging(opts);
  if (!pkgAndAuthInfo) return process.exit(1);
  const { ok, appId } = await getOrCreateAppAndWriteToEnv(pkgAndAuthInfo, opts);
  if (!ok) {
    return process.exit(1);
  }

  // Create schema file if it doesn't exist
  // or ask to push if local schema exists
  const localSchemaExists = await readLocalSchemaFile();
  if (!localSchemaExists) {
    await pull('schema', appId, pkgAndAuthInfo);
  } else {
    const doSchemaPush = await promptOk(
      {
        promptText: 'Found local schema. Push it to the new app?',
        inline: true,
      },
      program.opts(),
    );
    if (doSchemaPush) {
      await push('schema', appId, opts);
    }
  }

  // Create perms file if it doesn't exist
  // or ask to push if local perms exists
  const localPermsExists = await readLocalPermsFile();
  if (!localPermsExists) {
    await pull('perms', appId, pkgAndAuthInfo);
  } else {
    const doPermsPush = await promptOk(
      {
        promptText: 'Found local perms. Push it to the new app?',
        inline: true,
      },
      program.opts(),
    );
    if (doPermsPush) {
      await push('perms', appId, opts);
    }
  }
}

async function handleInitWithoutFiles(opts) {
  try {
    if (!opts?.title) {
      throw new Error(
        'Title is required for creating a new app without local files.',
      );
    }

    if (opts?.temp && opts?.orgId) {
      throw new Error('Cannot use --temp and --org-id flags together.');
    }

    let result;
    if (opts?.temp) {
      result = await createEphemeralApp(opts.title);
    } else {
      result = await createApp(opts.title, opts.orgId);
    }

    console.log(`${chalk.green('Succesfully created new app!')}\n`);
    console.log(
      toJson({
        app: result,
        error: null,
      }),
    );
  } catch (error) {
    console.log(`${chalk.red('Failed to create app.')}\n`);
    console.log(
      toJson({
        app: null,
        error: { message: error.message },
      }),
    );
    process.exit(1);
  }
}

async function handlePush(bag, opts) {
  const pkgAndAuthInfo = await enforcePackageAndAuthInfoWithErrorLogging(opts);
  if (!pkgAndAuthInfo) return process.exit(1);
  const { ok, appId } = await detectAppWithErrorLogging(opts);
  if (!ok) return process.exit(1);
  if (!appId) {
    error(
      'No app ID detected. Please specify one with --app or set up with `instant-cli init`',
    );
    return;
  }
  await push(bag, appId, opts);
}

async function handlePull(bag, opts) {
  const pkgAndAuthInfo = await enforcePackageAndAuthInfoWithErrorLogging(opts);
  if (!pkgAndAuthInfo) return process.exit(1);
  const { ok, appId } = await detectAppWithErrorLogging(opts);
  if (!ok) {
    return process.exit(1);
  }
  if (!appId) {
    error(
      'No app ID detected. Please specify one with --app or set up with `instant-cli init`',
    );
    return;
  }
  await pull(bag, appId, pkgAndAuthInfo);
}

async function push(bag, appId, opts) {
  if (bag === 'schema' || bag === 'all') {
    const { ok } = await pushSchema(appId, opts);
    if (!ok) return process.exit(1);
  }
  if (bag === 'perms' || bag === 'all') {
    const { ok } = await pushPerms(appId);
    if (!ok) return process.exit(1);
  }
}

function printDotEnvInfo(envType, appId) {
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
  console.log(terminalLink('Dashboard:', appDashUrl(appId)) + '\n');
}

async function handleEnvFile(pkgAndAuthInfo, { appId, appToken }) {
  const { pkgDir } = pkgAndAuthInfo;
  const envType = await detectEnvType(pkgAndAuthInfo);
  const envName = potentialEnvs[envType];

  const envFile = program.optsWithGlobals().env ?? '.env';
  const hasEnvFile = await pathExists(join(pkgDir, envFile));
  if (hasEnvFile) {
    printDotEnvInfo(envType, appId);
    return;
  }
  console.log(
    `\nLooks like you don't have a ${chalk.green(`\`${envFile}\``)} file yet.`,
  );
  console.log(
    `If we set ${chalk.green(envName)} & ${chalk.green('INSTANT_APP_ADMIN_TOKEN')}, we can remember the app that you chose for all future commands.`,
  );

  const saveExtraInfo =
    envFile !== '.env' ? chalk.green('  (will create `' + envFile + '`)') : '';

  const ok = await promptOk(
    {
      inline: true,
      promptText: 'Want us to create this env file for you?' + saveExtraInfo,
      modifyOutput: (a) => a,
    },
    program.opts(),
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
      [envName, appId],
      ['INSTANT_APP_ADMIN_TOKEN', appToken],
    ]
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';
  await writeFile(join(pkgDir, envFile), content, 'utf-8');
  if (envFile !== '.env') {
    console.log(`Created ${chalk.green(envFile)}!`);
  } else {
    console.log(`Created ${chalk.green('.env')} file!`);
  }
}

async function getOrCreateAppAndWriteToEnv(pkgAndAuthInfo, opts) {
  const ret = await detectOrCreateAppWithErrorLogging(opts);
  if (!ret.ok) return ret;
  const { appId, appToken, source } = ret;
  if (source === 'created' || source === 'imported') {
    await handleEnvFile(pkgAndAuthInfo, { appId, appToken });
  }
  return ret;
}

async function pull(bag, appId, pkgAndAuthInfo) {
  if (bag === 'schema' || bag === 'all') {
    const { ok } = await pullSchema(appId, pkgAndAuthInfo);
    if (!ok) return process.exit(1);
  }
  if (bag === 'perms' || bag === 'all') {
    const { ok } = await pullPerms(appId, pkgAndAuthInfo);
    if (!ok) return process.exit(1);
  }
}

async function login(options) {
  const registerRes = await fetchJson({
    method: 'POST',
    path: '/dash/cli/auth/register',
    debugName: 'Login register',
    errorMessage: 'Failed to register login.',
    noAuth: true,
  });

  if (!registerRes.ok) {
    return process.exit(1);
  }

  const { secret, ticket } = registerRes.data;

  console.log();

  if (isHeadlessEnvironment(options)) {
    console.log(
      `Open this URL in a browser to log in:\n ${instantDashOrigin}/dash?ticket=${ticket}\n`,
    );
  } else {
    const ok = await promptOk(
      {
        promptText: `This will open instantdb.com in your browser, OK to proceed?`,
      },
      program.opts(),
      /*defaultAnswer=*/ true,
    );

    if (!ok) return;
    openInBrowser(`${instantDashOrigin}/dash?ticket=${ticket}`);
  }

  console.log('Waiting for authentication...');
  const authTokenRes = await waitForAuthToken({ secret });
  if (!authTokenRes) {
    return process.exit(1);
  }

  const { token, email } = authTokenRes;

  if (options.print) {
    console.log(chalk.red('[Do not share] Your Instant auth token:', token));
  } else {
    await saveConfigAuthToken(token);
    console.log(chalk.green(`Successfully logged in as ${email}!`));
  }
  return token;
}

async function logout() {
  const { authConfigFilePath } = getAuthPaths();

  try {
    await unlink(authConfigFilePath);
    console.log(chalk.green('Successfully logged out from Instant!'));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(chalk.green('You were already logged out!'));
    } else {
      error('Failed to logout: ' + error.message);
    }
    return false;
  }
}

const packageAliasAndFullNames = {
  react: '@instantdb/react',
  'react-native': '@instantdb/react-native',
  core: '@instantdb/core',
  admin: '@instantdb/admin',
};

async function getOrInstallInstantModuleWithErrorLogging(pkgDir, opts) {
  const pkgJson = await getPackageJSONWithErrorLogging(pkgDir);
  if (!pkgJson) {
    return;
  }
  console.log('Checking for an Instant SDK...');
  const instantModuleName = await getInstantModuleName(pkgJson);
  if (instantModuleName) {
    console.log(
      `Found ${chalk.green(instantModuleName)} in your package.json.`,
    );
    return instantModuleName;
  }
  console.log(
    "Couldn't find an Instant SDK in your package.json, let's install one!",
  );

  let moduleName;
  if (opts.package) {
    moduleName = packageAliasAndFullNames[opts.package];
  } else {
    if (program.optsWithGlobals()?.yes) {
      console.error(
        '--yes was provided without a package specificaion and no Instant SDK was found',
      );
      process.exit(1);
    }
    moduleName = await renderUnwrap(
      new UI.Select({
        promptText: 'Which package would you like to use?',
        options: [
          { label: '@instantdb/react', value: '@instantdb/react' },
          {
            label: '@instantdb/react-native',
            value: '@instantdb/react-native',
          },
          { label: '@instantdb/core', value: '@instantdb/core' },
          { label: '@instantdb/admin', value: '@instantdb/admin' },
        ],
      }),
    );
  }

  const packageManager = await detectPackageManager(pkgDir);

  const packagesToInstall = [moduleName];
  if (moduleName === '@instantdb/react-native') {
    packagesToInstall.push(
      'react-native-get-random-values',
      '@react-native-async-storage/async-storage',
    );
  }

  const installCommand = getInstallCommand(
    packageManager,
    packagesToInstall.join(' '),
  );

  await renderUnwrap(
    new UI.Spinner({
      promise: execAsync(installCommand, pkgDir),
      workingText: `Installing ${packagesToInstall.join(', ')} using ${packageManager}...`,
      doneText: `Installed ${packagesToInstall.join(', ')} using ${packageManager}.`,
    }),
  );

  return moduleName;
}

async function promptCreateApp(opts) {
  const id = randomUUID();
  const token = randomUUID();

  let _title;
  if (opts?.title) {
    _title = opts.title;
  } else {
    _title = await renderUnwrap(
      new UI.TextInput({
        prompt: 'What would you like to call it?',
        placeholder: 'My cool app',
      }),
    ).catch(() => null);
  }

  const title = _title?.trim();

  if (!title) {
    error('No name provided.');
    return { ok: false };
  }

  const res = await fetchJson({
    debugName: 'Fetching orgs',
    method: 'GET',
    path: '/dash',
    errorMessage: 'Failed to fetch apps.',
  });
  if (!res.ok) {
    return { ok: false };
  }

  const allowedOrgs = res.data.orgs.filter((org) => org.role !== 'app-member');

  let org_id = opts.org;

  if (!org_id && allowedOrgs.length) {
    const choices = [{ label: '(No organization)', value: null }];
    for (const org of allowedOrgs) {
      choices.push({ label: org.title, value: org.id });
    }
    const choice = await renderUnwrap(
      new UI.Select({
        promptText: 'Would you like to create the app in an organization?',
        options: choices,
      }),
    );
    if (choice) {
      org_id = choice;
    }
  }

  const app = { id, title, admin_token: token, org_id };
  const appRes = await fetchJson({
    method: 'POST',
    path: '/dash/apps',
    debugName: 'App create',
    errorMessage: 'Failed to create app.',
    body: app,
  });

  if (!appRes.ok) return { ok: false };
  return {
    ok: true,
    appId: id,
    appTitle: title,
    appToken: token,
    source: 'created',
  };
}

async function promptImportAppOrCreateApp() {
  const res = await fetchJson({
    debugName: 'Fetching apps',
    method: 'GET',
    path: '/dash',
    errorMessage: 'Failed to fetch apps.',
  });
  if (!res.ok) {
    return { ok: false };
  }

  const result = await renderUnwrap(
    new UI.AppSelector({
      allowEphemeral: false,
      allowCreate: true,
      startingMenuIndex: 2,
      api: {
        getDash: () => res.data,
        createEphemeralApp: async (title) => {
          const id = randomUUID();
          const token = randomUUID();
          const app = { id, title, admin_token: token };
          const appRes = await fetchJson({
            method: 'POST',
            path: '/dash/apps/ephemeral',
            debugName: 'Ephemeral app create',
            errorMessage: 'Failed to create ephemeral app.',
            body: app,
          });
          if (!appRes.ok) throw new Error('Failed to create temporary app');
          return { appId: id, adminToken: token };
        },
        getAppsForOrg: async (orgId) => {
          const orgsRes = await fetchJson({
            debugName: 'Fetching org apps',
            method: 'GET',
            path: `/dash/orgs/${orgId}`,
            errorMessage: 'Failed to fetch apps.',
          });
          if (!orgsRes.ok) {
            throw new Error('Failed to fetch org apps');
          }
          return { apps: orgsRes.data.apps };
        },
        createApp: async (title, orgId) => {
          const id = randomUUID();
          const token = randomUUID();
          const app = { id, title, admin_token: token, org_id: orgId };
          const appRes = await fetchJson({
            method: 'POST',
            path: '/dash/apps',
            debugName: 'App create',
            errorMessage: 'Failed to create app.',
            body: app,
          });
          if (!appRes.ok) throw new Error('Failed to create app');
          return { appId: id, adminToken: token };
        },
      },
    }),
  );

  return {
    ok: true,
    appId: result.appId,
    appToken: result.adminToken,
    source: result.approach === 'import' ? 'imported' : 'created',
  };

  // let apps = res.data.apps;
  // let orgName;
  // let orgId;
  // if (orgs.length) {
  //   const choices = [{ label: '(No organization)', value: null }];
  //   for (const org of orgs) {
  //     choices.push({ label: org.title, value: org.id });
  //   }
  //   const choice = await renderUnwrap(
  //     new UI.Select({
  //       promptText: 'Would you like to import an app from an organization?',
  //       options: choices,
  //     }),
  //   );
  //   if (choice) {
  //     const orgsRes = await fetchJson({
  //       debugName: 'Fetching apps',
  //       method: 'GET',
  //       path: `/dash/orgs/${choice}`,
  //       errorMessage: 'Failed to fetch apps.',
  //     });
  //     if (!orgsRes.ok) {
  //       return { ok: false };
  //     }
  //     apps = orgsRes.data.apps;
  //     orgName = orgsRes.data.org.title;
  //     orgId = choice;
  //   } else {
  //     apps = res.data.apps;
  //   }
  // }
  // if (!apps.length) {
  //   const ok = await promptOk(
  //     {
  //       promptText: `You don't have any apps${orgName ? ` in ${orgName}` : ''}. Want to create a new one?`,
  //     },
  //     program.opts(),
  //     /*defaultAnswer=*/ true,
  //   );
  //   if (!ok) return { ok: false };
  //   return await promptCreateApp({ org: orgId });
  // }

  // apps.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  // const choice = await renderUnwrap(
  //   new UI.Select({
  //     promptText: 'Which app would you like to import?',
  //     options: apps.map((app) => {
  //       return { label: `${app.title} (${app.id})`, value: app.id };
  //     }),
  //   }),
  // );
  // if (!choice) return { ok: false };
  // return { ok: true, appId: choice, source: 'imported' };
}

async function createApp(title, orgId) {
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token, org_id: orgId };
  const appRes = await fetchJson({
    method: 'POST',
    path: '/dash/apps',
    debugName: 'App create',
    errorMessage: 'Failed to create app.',
    body: app,
  });
  if (!appRes.ok) throw new Error('Failed to create app');
  return { appId: id, adminToken: token };
}

async function createEphemeralApp(title) {
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token };
  const appRes = await fetchJson({
    method: 'POST',
    path: '/dash/apps/ephemeral',
    debugName: 'Ephemeral app create',
    errorMessage: 'Failed to create ephemeral app.',
    body: app,
  });
  if (!appRes.ok) throw new Error('Failed to create temporary app');
  return { appId: id, adminToken: token };
}

async function detectAppWithErrorLogging(opts) {
  const fromOpts = await detectAppIdFromOptsWithErrorLogging(opts);
  if (!fromOpts.ok) return fromOpts;
  if (fromOpts.appId) {
    return { ok: true, appId: fromOpts.appId, source: 'opts' };
  }
  const fromEnv = detectAppIdFromEnvWithErrorLogging();
  if (!fromEnv.ok) return fromEnv;
  if (fromEnv.found) {
    const { envName, value } = fromEnv.found;
    console.log(`Found ${chalk.green(envName)}: ${value}`);
    return { ok: true, appId: value, source: 'env' };
  }
  return { ok: true };
}

async function detectOrCreateAppWithErrorLogging(opts) {
  const detected = await detectAppWithErrorLogging(opts);
  if (!detected.ok) return detected;
  if (detected.appId) {
    return detected;
  }
  let action;
  if (program.optsWithGlobals().yes) {
    action = 'create';
    if (!opts?.title) {
      console.error(
        chalk.red(`Title is required when using --yes and no app is linked`),
      );
      process.exit(1);
    }
    const app = await createApp(opts.title);

    return { ok: true, appId: app.appId, source: 'created' };
  } else {
    console.log();
    return await promptImportAppOrCreateApp();
  }
}

async function writeTypescript(path, content, encoding) {
  const prettierConfig = await prettier.resolveConfig(path);
  const formattedCode = await prettier.format(content, {
    ...prettierConfig,
    parser: 'typescript',
  });
  return await writeFile(path, formattedCode, encoding);
}

async function getInstantModuleName(pkgJson) {
  const deps = pkgJson.dependencies || {};
  const devDeps = pkgJson.devDependencies || {};
  const instantModuleName = [
    '@instantdb/react',
    '@instantdb/react-native',
    '@instantdb/core',
    '@instantdb/admin',
  ].find((name) => deps[name] || devDeps[name]);
  return instantModuleName;
}

async function getPackageJson(pkgDir) {
  return await readJsonFile(join(pkgDir, 'package.json'));
}

async function getPackageJSONWithErrorLogging(pkgDir) {
  const pkgJson = await getPackageJson(pkgDir);
  if (!pkgJson) {
    error(`Couldn't find a packge.json file in: ${pkgDir}. Please add one.`);
    return;
  }
  return pkgJson;
}

async function enforcePackageAndAuthInfoWithErrorLogging(_opts) {
  const pkgDir = await packageDirectoryWithErrorLogging();
  if (!pkgDir) {
    return;
  }
  const pkgJson = await getPackageJSONWithErrorLogging(pkgDir);
  if (!pkgJson) {
    return;
  }
  const instantModuleName = await getInstantModuleName(pkgJson);
  if (!instantModuleName) {
    error("We couldn't find an Instant SDK. Install one, or run `init`");
  }
  const authToken = await readConfigAuthTokenWithErrorLogging();
  if (!authToken) {
    return;
  }
  return { pkgDir, instantModuleName, authToken };
}

async function getOrPromptPackageAndAuthInfoWithErrorLogging(opts) {
  const pkgDir = await packageDirectoryWithErrorLogging();
  if (!pkgDir) {
    return;
  }
  const instantModuleName = await getOrInstallInstantModuleWithErrorLogging(
    pkgDir,
    opts,
  );
  if (!instantModuleName) {
    return;
  }
  const authToken = await readAuthTokenOrLoginWithErrorLogging();
  if (!authToken) {
    return;
  }
  return { pkgDir, instantModuleName, authToken };
}

async function pullSchema(appId, { pkgDir, instantModuleName }) {
  console.log('Pulling schema...');

  const pullRes = await fetchJson({
    path: `/dash/apps/${appId}/schema/pull`,
    debugName: 'Schema pull',
    errorMessage: 'Failed to pull schema.',
  });

  if (!pullRes.ok) return pullRes;

  if (
    !countEntities(pullRes.data.schema.refs) &&
    !countEntities(pullRes.data.schema.blobs)
  ) {
    console.log('Schema is empty. Skipping.');
    return { ok: true };
  }

  const prev = await readLocalSchemaFile();
  if (prev) {
    const shouldContinue = await promptOk(
      {
        promptText:
          'This will overwrite your local instant.schema.ts file, OK to proceed?',
        modifyOutput: UI.modifiers.yPadding,
        inline: true,
      },
      program.opts(),
    );
    console.log();

    if (!shouldContinue) return { ok: true };
  }

  const shortSchemaPath = getSchemaPathToWrite(prev?.path);
  const schemaPath = join(pkgDir, shortSchemaPath);

  await writeTypescript(
    schemaPath,
    generateSchemaTypescriptFile(
      prev?.schema,
      apiSchemaToInstantSchemaDef(pullRes.data.schema),
      instantModuleName,
    ),
    'utf-8',
  );

  console.log('✅ Wrote schema to ' + shortSchemaPath);

  return { ok: true };
}

async function pullPerms(appId, { pkgDir, instantModuleName }) {
  console.log('Pulling perms...');

  const pullRes = await fetchJson({
    path: `/dash/apps/${appId}/perms/pull`,
    debugName: 'Perms pull',
    errorMessage: 'Failed to pull perms.',
  });

  if (!pullRes.ok) return pullRes;
  const prev = await readLocalPermsFile();
  if (prev) {
    const shouldContinue = await promptOk(
      {
        promptText:
          'This will overwrite your local instant.perms.ts file, OK to proceed?',
        modifyOutput: UI.modifiers.yPadding,
        inline: true,
      },
      program.opts(),
    );
    console.log();

    if (!shouldContinue) return { ok: true };
  }

  const shortPermsPath = getPermsPathToWrite(prev?.path);
  const permsPath = join(pkgDir, shortPermsPath);
  await writeTypescript(
    permsPath,
    generatePermsTypescriptFile(pullRes.data.perms || {}, instantModuleName),
    'utf-8',
  );

  console.log('✅ Wrote permissions to ' + shortPermsPath);

  return { ok: true };
}

function indexingJobCompletedActionMessage(job) {
  if (job.job_type === 'check-data-type') {
    return `setting type of ${job.attr_name} to ${job.checked_data_type}`;
  }
  if (job.job_type === 'remove-data-type') {
    return `removing type from ${job.attr_name}`;
  }
  if (job.job_type === 'index') {
    return `adding index to ${job.attr_name}`;
  }
  if (job.job_type === 'remove-index') {
    return `removing index from ${job.attr_name}`;
  }
  if (job.job_type === 'unique') {
    return `adding uniqueness constraint to ${job.attr_name}`;
  }
  if (job.job_type === 'remove-unique') {
    return `removing uniqueness constraint from ${job.attr_name}`;
  }
  if (job.job_type === 'required') {
    return `adding required constraint to ${job.attr_name}`;
  }
  if (job.job_type === 'remove-required') {
    return `removing required constraint from ${job.attr_name}`;
  }
  return `unexpected job type ${job.job_type} - please ping us on discord with this job id (${job.id})`;
}

function truncate(s, maxLen) {
  if (s.length > maxLen) {
    return `${s.substr(0, maxLen - 3)}...`;
  }
  return s;
}

function formatSamples(triples_samples) {
  return triples_samples.slice(0, 3).map((t) => {
    return { ...t, value: truncate(JSON.stringify(t.value), 32) };
  });
}

function createUrl(triple, job) {
  const urlParams = new URLSearchParams({
    s: 'main',
    app: job.app_id,
    t: 'explorer',
    ns: job.attr_name.split('.')[0],
    where: JSON.stringify(['id', triple.entity_id]),
  });
  const url = new URL(instantDashOrigin);
  url.pathname = '/dash';
  url.search = urlParams.toString();
  return url;
}

function padCell(value, width) {
  const trimmed = value.length > width ? value.substring(0, width) : value;
  return trimmed + ' '.repeat(width - trimmed.length);
}

function indexingJobCompletedMessage(job) {
  const actionMessage = indexingJobCompletedActionMessage(job);
  if (job.job_status === 'canceled') {
    return `Canceled ${actionMessage} before it could finish.`;
  }
  if (job.job_status === 'completed') {
    return `Finished ${actionMessage}.`;
  }
  if (job.job_status === 'errored') {
    if (job.invalid_triples_sample?.length) {
      const [etype, label] = job.attr_name.split('.');
      const samples = formatSamples(job.invalid_triples_sample);
      const longestValue = samples.reduce(
        (acc, { value }) => Math.max(acc, value.length),
        label.length,
      );

      const columns = [
        { header: 'namespace', width: 15, getValue: () => etype },
        {
          header: 'id',
          width: 37,
          getValue: (triple) =>
            terminalLink(triple.entity_id, createUrl(triple, job).toString(), {
              fallback: () => triple.entity_id,
            }),
        },
        {
          header: label,
          width: longestValue + 2,
          getValue: (triple) => triple.value,
        },
        { header: 'type', width: 8, getValue: (triple) => triple.json_type },
      ];

      let msg = `${chalk.red('INVALID DATA')} ${actionMessage}.\n`;
      if (job.invalid_unique_value) {
        msg += `  Found multiple entities with value ${truncate(JSON.stringify(job.invalid_unique_value), 64)}.\n`;
      }
      if (job.error === 'triple-too-large-error') {
        msg += `  Some of the existing data is too large to index.\n`;
      }

      msg += `  First few examples:\n`;
      msg += `  ${columns.map((col) => chalk.bold(padCell(col.header, col.width))).join(' | ')}\n`;
      msg += `  ${columns.map((col) => '-'.repeat(col.width)).join('-|-')}\n`;

      for (const triple of samples) {
        const cells = columns.map((col) =>
          padCell(col.getValue(triple), col.width),
        );
        msg += `  ${cells.join(' | ')}\n`;
      }
      return msg;
    }
    return `Error ${actionMessage}.`;
  }
}

function joinInSentence(items) {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function jobGroupDescription(jobs) {
  const actions = new Set();
  const jobActions = {
    'check-data-type': 'updating types',
    'remove-data-type': 'updating types',
    index: 'updating indexes',
    'remove-index': 'updating indexes',
    unique: 'updating uniqueness constraints',
    'remove-unique': 'updating uniqueness constraints',
    required: 'making attributes required',
    'remove-required': 'making attributes optional',
  };
  for (const job of jobs) {
    actions.add(jobActions[job.job_type]);
  }
  return joinInSentence([...actions].sort()) || 'updating schema';
}

async function waitForIndexingJobsToFinish(appId, data) {
  const spinnerDefferedPromise = deferred();
  const spinner = new UI.Spinner({
    promise: spinnerDefferedPromise.promise,
  });
  const spinnerRenderPromise = renderUnwrap(spinner);

  const groupId = data['group-id'];
  let jobs = data.jobs;
  let waitMs = 20;
  let lastUpdatedAt = new Date(0);

  const completedIds = new Set();

  const errorMessages = [];

  while (true) {
    let stillRunning = false;
    let updated = false;
    let workEstimateTotal = 0;
    let workCompletedTotal = 0;

    for (const job of jobs) {
      const updatedAt = new Date(job.updated_at);
      if (updatedAt > lastUpdatedAt) {
        updated = true;
        lastUpdatedAt = updatedAt;
      }
      if (job.job_status === 'waiting' || job.job_status === 'processing') {
        stillRunning = true;
        // Default estimate to high value to prevent % from jumping around
        workEstimateTotal += job.work_estimate ?? 50000;
        workCompletedTotal += job.work_completed ?? 0;
      } else {
        if (!completedIds.has(job.id)) {
          completedIds.add(job.id);
          const msg = indexingJobCompletedMessage(job);
          if (msg) {
            if (job.job_status === 'errored') {
              spinner.addMessage(msg);
              errorMessages.push(msg);
            } else {
              spinner.addMessage(msg);
            }
          }
        }
      }
    }
    if (!stillRunning) {
      break;
    }
    if (workEstimateTotal) {
      const percent = Math.floor(
        (workCompletedTotal / workEstimateTotal) * 100,
      );
      spinner.updateText(`${jobGroupDescription(jobs)} ${percent}%`);
    }
    waitMs = updated ? 1 : Math.min(10000, waitMs * 2);
    await sleep(waitMs);
    const res = await fetchJson({
      debugName: 'Check indexing status',
      method: 'GET',
      path: `/dash/apps/${appId}/indexing-jobs/group/${groupId}`,
      errorMessage: 'Failed to check indexing status.',
    });
    if (!res.ok) {
      break;
    }
    jobs = res.data.jobs;
  }

  spinnerDefferedPromise.resolve(null);

  await spinnerRenderPromise;

  // Log errors at the end so that they're easier to see.
  if (errorMessages.length) {
    for (const msg of errorMessages) {
      console.log(msg);
    }
    console.log(chalk.red('Some steps failed while updating schema.'));
    process.exit(1);
  }
}

const resolveRenames = async (created, promptData, extraInfo) => {
  const answer = await renderUnwrap(
    new ResolveRenamePrompt(
      created,
      promptData,
      extraInfo,
      UI.modifiers.piped([
        (out) =>
          boxen(out, {
            dimBorder: true,
            padding: {
              left: 1,
              right: 1,
            },
          }),
        UI.modifiers.vanishOnComplete,
      ]),
    ),
  );
  return answer;
};

function collectSystemCatalogIdentNames(currentAttrs) {
  const allSystemIdents = currentAttrs
    .filter((attr) => attr.catalog === 'system')
    .flatMap((attr) =>
      [attr['forward-identity'], attr['reverse-identity']].filter(Boolean),
    );

  /** @type {Record<string, Set<string>>} */
  let res = {};
  for (const [_, etype, label] of allSystemIdents) {
    res[etype] = res[etype] || new Set();
    res[etype].add(label);
  }
  return res;
}

async function pushSchema(appId, opts) {
  const res = await readLocalSchemaFileWithErrorLogging();
  if (!res) return { ok: false };
  const { schema } = res;

  const pulledSchemaResponse = await fetchJson({
    method: 'GET',
    path: `/dash/apps/${appId}/schema/pull`,
    debugName: 'Schema plan',
    errorMessage: 'Failed to get old schema.',
  });

  if (!pulledSchemaResponse.ok) return pulledSchemaResponse;

  const currentAttrs = pulledSchemaResponse.data['attrs'];
  const currentApiSchema = pulledSchemaResponse.data['schema'];
  const oldSchema = apiSchemaToInstantSchemaDef(currentApiSchema);
  const systemCatalogIdentNames = collectSystemCatalogIdentNames(currentAttrs);

  try {
    validateSchema(schema, systemCatalogIdentNames);
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      console.error(chalk.red('Invalid schema:', error.message));
    } else {
      console.error('Unexpected error:', error);
    }
    return { ok: false };
  }

  const renameSelector = program.optsWithGlobals().yes
    ? buildAutoRenameSelector(opts)
    : resolveRenames;

  const diffResult = await diffSchemas(
    oldSchema,
    schema,
    renameSelector,
    systemCatalogIdentNames,
  );

  if (currentAttrs === undefined) {
    throw new Error("Couldn't get current schema from server");
  }

  const txSteps = convertTxSteps(diffResult, currentAttrs);

  if (txSteps.length === 0) {
    console.log(chalk.bgGray('No schema changes to apply!'));
    return { ok: true };
  }

  let wantsToPush = false;
  try {
    const groupedSteps = groupSteps(diffResult);
    const lines = renderSchemaPlan(groupedSteps, currentAttrs);
    if (program.optsWithGlobals().yes) {
      console.log('Applying schema changes...');
      console.log(lines.join('\n'));
    }
    wantsToPush = await promptOk(
      {
        promptText: 'Push these changes?',
        yesText: 'Push',
        noText: 'Cancel',
        modifyOutput: (output) => {
          let both = lines.join('\n') + '\n\n' + output;
          return boxen(both, {
            dimBorder: true,
            padding: {
              left: 1,
              right: 1,
            },
          });
        },
      },
      program.opts(),
    );
  } catch (error) {
    if (error instanceof CancelSchemaError) {
      console.info('Schema migration cancelled!');
    }
    return { ok: false };
  }

  if (verbose) {
    console.log(txSteps);
  }

  if (wantsToPush) {
    const applyRes = await fetchJson({
      method: 'POST',
      path: `/dash/apps/${appId}/schema/steps/apply`,
      debugName: 'Schema apply',
      errorMessage: 'Failed to update schema.',
      body: {
        steps: txSteps,
      },
    });
    console.log(chalk.green('Schema updated!'));
    if (!applyRes.ok) return applyRes;

    if (applyRes.data['indexing-jobs']) {
      await waitForIndexingJobsToFinish(appId, applyRes.data['indexing-jobs']);
    }
  } else {
    console.info('Schema migration cancelled!');
  }

  return { ok: true };
}

async function claimEphemeralApp(appId, adminToken) {
  const res = await fetchJson({
    method: 'POST',
    body: {
      app_id: appId,
      token: adminToken,
    },
    path: `/dash/apps/ephemeral/${appId}/claim`,
    debugName: 'Claim ephemeral app',
    errorMessage: 'Failed to claim ephemeral app.',
  });

  if (!res.ok) return res;

  console.log(chalk.green('App claimed!'));
  return { ok: true };
}

async function pushPerms(appId) {
  const res = await readLocalPermsFileWithErrorLogging();
  if (!res) {
    return { ok: true };
  }

  console.log('Planning perms...');

  const prodPerms = await fetchJson({
    path: `/dash/apps/${appId}/perms/pull`,
    debugName: 'Perms pull',
    errorMessage: 'Failed to pull perms.',
  });

  if (!prodPerms.ok) return prodPerms;

  const diffedStr = jsonDiff.diffString(
    prodPerms.data.perms || {},
    res.perms || {},
  );
  if (!diffedStr.length) {
    console.log('No perms changes detected. Skipping.');
    return { ok: true };
  }

  const okPush = await promptOk(
    {
      promptText: 'Push these changes to your perms?',
      modifyOutput: (output) => {
        let both = diffedStr + '\n' + output;
        return boxen(both, {
          dimBorder: true,
          padding: {
            left: 1,
            right: 1,
          },
        });
      },
    },
    program.opts(),
  );
  if (!okPush) return { ok: true };

  const permsRes = await fetchJson({
    method: 'POST',
    path: `/dash/apps/${appId}/rules`,
    debugName: 'Schema apply',
    errorMessage: 'Failed to update schema.',
    body: {
      code: res.perms,
    },
  });

  if (!permsRes.ok) return permsRes;

  console.log(chalk.green('Permissions updated!'));

  return { ok: true };
}

async function waitForAuthToken({ secret }) {
  for (let i = 1; i <= 120; i++) {
    await sleep(1000);
    const authCheckRes = await fetchJson({
      method: 'POST',
      debugName: 'Auth check',
      errorMessage: 'Failed to check auth status.',
      path: '/dash/cli/auth/check',
      body: { secret },
      noAuth: true,
      noLogError: true,
    });
    if (authCheckRes.ok) {
      return authCheckRes.data;
    }
    if (authCheckRes.data?.hint.errors?.[0]?.issue === 'waiting-for-user') {
      continue;
    }
    error('Failed to authenticate ');
    prettyPrintJSONErr(authCheckRes.data);
    return;
  }
  error('Timed out waiting for authentication');
  return null;
}

// resources

/**
 * Fetches JSON data from a specified path using the POST method.
 *
 * @param {Object} options
 * @param {string} options.debugName
 * @param {string} options.errorMessage
 * @param {string} options.path
 * @param {'POST' | 'GET'} [options.method]
 * @param {Object} [options.body=undefined]
 * @param {boolean} [options.noAuth]
 * @param {boolean} [options.noLogError]
 * @returns {Promise<{ ok: boolean; data: any }>}
 */
async function fetchJson({
  debugName,
  errorMessage,
  path,
  body,
  method,
  noAuth,
  noLogError,
}) {
  const withAuth = !noAuth;
  const withErrorLogging = !noLogError;
  let authToken = null;
  if (withAuth) {
    authToken = await readConfigAuthTokenWithErrorLogging();
    if (!authToken) {
      return { ok: false, data: undefined };
    }
  }
  const timeoutMs = 1000 * 60 * 5; // 5 minutes

  try {
    const res = await fetch(`${instantBackendOrigin}${path}`, {
      method: method ?? 'GET',
      headers: {
        ...(withAuth ? { Authorization: `Bearer ${authToken}` } : {}),
        'Content-Type': 'application/json',
        'Instant-CLI-Version': version,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (verbose) {
      console.log(debugName, 'response:', res.status, res.statusText);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (verbose && data) {
      console.log(debugName, 'json:', JSON.stringify(data, null, 2));
    }
    if (!res.ok) {
      if (withErrorLogging) {
        error(errorMessage);
        prettyPrintJSONErr(data);
      }
      return { ok: false, data };
    }

    return { ok: true, data };
  } catch (err) {
    if (withErrorLogging) {
      if (err.name === 'AbortError') {
        error(
          `Timeout: It took more than ${timeoutMs / 60000} minutes to get the result.`,
        );
      } else {
        error(`Error: type: ${err.name}, message: ${err.message}`);
      }
    }
    return { ok: false, data: null };
  }
}

function prettyPrintJSONErr(data) {
  if (data?.message) {
    error(data.message);
  }
  if (Array.isArray(data?.hint?.errors)) {
    for (const err of data.hint.errors) {
      error(`${err.in ? err.in.join('->') + ': ' : ''}${err.message}`);
    }
  }
  if (!data) {
    error('Failed to parse error response');
  }
}

/**
 * We need to do a bit of a hack of `@instantdb/react-native`.
 *
 * If a user writes import { i } from '@instantdb/react-native'
 *
 * We will fail to evaluate the file. This is because
 * `@instantdb/react-native` brings in `react-native`, which
 * does not run in a node context.
 *
 * To bypass this, we have a 'cli' module inside `react-native`, which
 * has all the necessary imports
 */
function transformImports(code) {
  return code.replace(
    /["']@instantdb\/react-native["']/g,
    '"@instantdb/react-native/dist/cli"',
  );
}

function getEnvPermsPathWithLogging() {
  const path = process.env.INSTANT_PERMS_FILE_PATH;
  if (path) {
    console.log(
      `Using INSTANT_PERMS_FILE_PATH=${chalk.green(process.env.INSTANT_PERMS_FILE_PATH)}`,
    );
  }
  return path;
}

function getPermsReadCandidates() {
  const existing = getEnvPermsPathWithLogging();
  if (existing) return [{ files: existing, transform: transformImports }];
  return [
    {
      files: 'instant.perms',
      extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'],
      transform: transformImports,
    },
    {
      files: 'src/instant.perms',
      extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'],
      transform: transformImports,
    },
    {
      files: 'app/instant.perms',
      extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'],
      transform: transformImports,
    },
  ];
}

function getPermsPathToWrite(existingPath) {
  if (existingPath) return existingPath;
  if (process.env.INSTANT_PERMS_FILE_PATH) {
    return process.env.INSTANT_PERMS_FILE_PATH;
  }
  if (existsSync(path.join(process.cwd(), 'src'))) {
    return path.join('src', 'instant.perms.ts');
  }
  return 'instant.perms.ts';
}

async function readLocalPermsFile() {
  const readCandidates = getPermsReadCandidates();
  const res = await loadConfig({
    sources: readCandidates,
    merge: false,
  });
  if (!res.config) return;
  const relativePath = path.relative(process.cwd(), res.sources[0]);
  return { path: relativePath, perms: res.config };
}

async function readLocalPermsFileWithErrorLogging() {
  const res = await readLocalPermsFile();
  if (!res) {
    error(
      `We couldn't find your ${chalk.yellow('`instant.perms.ts`')} file. Make sure it's in the root directory.`,
    );
  }
  return res;
}

function getEnvSchemaPathWithLogging() {
  const path = process.env.INSTANT_SCHEMA_FILE_PATH;
  if (path) {
    console.log(
      `Using INSTANT_SCHEMA_FILE_PATH=${chalk.green(process.env.INSTANT_SCHEMA_FILE_PATH)}`,
    );
  }
  return path;
}

function getSchemaReadCandidates() {
  const existing = getEnvSchemaPathWithLogging();
  if (existing) return [{ files: existing, transform: transformImports }];
  return [
    {
      files: 'instant.schema',
      extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'],
      transform: transformImports,
    },
    {
      files: 'src/instant.schema',
      extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'],
      transform: transformImports,
    },
    {
      files: 'app/instant.schema',
      extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'],
      transform: transformImports,
    },
  ];
}

function getSchemaPathToWrite(existingPath) {
  if (existingPath) return existingPath;
  if (process.env.INSTANT_SCHEMA_FILE_PATH) {
    return process.env.INSTANT_SCHEMA_FILE_PATH;
  }
  // If there is a src folder
  if (existsSync(path.join(process.cwd(), 'src'))) {
    return path.join('src', 'instant.schema.ts');
  }

  return 'instant.schema.ts';
}

async function readLocalSchemaFile() {
  const readCandidates = getSchemaReadCandidates();
  const res = await loadConfig({
    sources: readCandidates,
    merge: false,
  });
  if (!res.config) return;
  const relativePath = path.relative(process.cwd(), res.sources[0]);
  return { path: relativePath, schema: res.config };
}

async function readInstantConfigFile() {
  return (
    await loadConfig({
      sources: [
        // load from `instant.config.xx`
        {
          files: 'instant.config',
          extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'],
        },
      ],
      // if false, the only the first matched will be loaded
      // if true, all matched will be loaded and deep merged
      merge: false,
    })
  ).config;
}

async function readLocalSchemaFileWithErrorLogging() {
  const res = await readLocalSchemaFile();

  if (!res) {
    error(
      `We couldn't find your ${chalk.yellow('`instant.schema.ts`')} file. Make sure it's in the root directory.`,
    );
    return;
  }

  if (res.schema?.constructor?.name !== 'InstantSchemaDef') {
    error("We couldn't find your schema export.");
    error(
      'In your ' +
        chalk.green('`instant.schema.ts`') +
        ' file, make sure you ' +
        chalk.green('`export default schema`'),
    );
    return;
  }

  return res;
}

async function readConfigAuthToken(allowAdminToken = true) {
  const options = program.opts();
  if (typeof options.token === 'string') {
    return options.token;
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

  if (allowAdminToken) {
    const adminTokenNames = Object.values(potentialAdminTokenEnvs);
    for (const envName of adminTokenNames) {
      const token = process.env[envName];
      if (token) {
        return token;
      }
    }
  }
  return null;
}

export async function readConfigAuthTokenWithErrorLogging() {
  const token = await readConfigAuthToken();
  if (!token) {
    error(
      `Looks like you are not logged in. Please log in with ${chalk.green('`instant-cli login`')}`,
    );
  }
  return token;
}

async function readAuthTokenOrLoginWithErrorLogging() {
  const token = await readConfigAuthToken();
  if (token) return token;
  console.log(`Looks like you are not logged in...`);
  console.log(`Let's log in!`);
  return await login({});
}

async function saveConfigAuthToken(authToken) {
  const authPaths = getAuthPaths();

  await mkdir(authPaths.appConfigDirPath, {
    recursive: true,
  });

  return writeFile(authPaths.authConfigFilePath, authToken, 'utf-8');
}

// utils

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countEntities(o) {
  return Object.keys(o).length;
}

function sortedEntries(o) {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// attr helpers
function identEtype(ident) {
  return ident[1];
}

function identLabel(ident) {
  return ident[2];
}

function identName(ident) {
  return `${identEtype(ident)}.${identLabel(ident)}`;
}

function attrFwdLabel(attr) {
  return attr['forward-identity']?.[2];
}

function attrFwdEtype(attr) {
  return attr['forward-identity']?.[1];
}

function attrRevLabel(attr) {
  return attr['reverse-identity']?.[2];
}

function attrRevEtype(attr) {
  return attr['reverse-identity']?.[1];
}

function attrFwdName(attr) {
  return `${attrFwdEtype(attr)}.${attrFwdLabel(attr)}`;
}

function attrRevName(attr) {
  if (attr['reverse-identity']) {
    return `${attrRevEtype(attr)}.${attrRevLabel(attr)}`;
  }
}

// templates and constants

export const rels = {
  'many-false': ['many', 'many'],
  'one-true': ['one', 'one'],
  'many-true': ['many', 'one'],
  'one-false': ['one', 'many'],
};

function isUUID(uuid) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

async function detectAppIdFromOptsWithErrorLogging(opts) {
  if (!opts.app) return { ok: true };
  const appId = opts.app;
  const config = await readInstantConfigFile();
  const nameMatch = config?.apps?.[appId];
  const namedAppId = nameMatch?.id && isUUID(nameMatch.id) ? nameMatch : null;
  const uuidAppId = appId && isUUID(appId) ? appId : null;

  if (nameMatch && !namedAppId) {
    error(`Expected \`${appId}\` to point to a UUID, but got ${nameMatch.id}.`);
    return { ok: false };
  }
  if (!namedAppId && !uuidAppId) {
    error(`Expected App ID to be a UUID, but got: ${chalk.red(appId)}`);
    return { ok: false };
  }
  return { ok: true, appId: namedAppId || uuidAppId };
}

function detectAppIdFromEnvWithErrorLogging() {
  const found = Object.keys(potentialEnvs)
    .map((type) => {
      const envName = potentialEnvs[type];
      const value = process.env[envName];
      return { type, envName, value };
    })
    .find(({ value }) => !!value);
  if (found && !isUUID(found.value)) {
    error(
      `Found ${chalk.green('`' + found.envName + '`')} but it's not a valid UUID.`,
    );
    return { ok: false, found };
  }
  return { ok: true, found };
}

function detectAppIdAndAdminTokenFromEnvWithErrorLogging() {
  const appIdResult = Object.keys(potentialEnvs)
    .map((type) => {
      const envName = potentialEnvs[type];
      const value = process.env[envName];
      return { type, envName, value };
    })
    .find(({ value }) => !!value);

  const adminTokenResult = Object.keys(potentialAdminTokenEnvs)
    .map((type) => {
      const envName = potentialAdminTokenEnvs[type];
      const value = process.env[envName];
      return { type, envName, value };
    })
    .find(({ value }) => !!value);

  if (appIdResult && !isUUID(appIdResult.value)) {
    error(
      `Found ${chalk.green('`' + appIdResult.envName + '`')} but it's not a valid UUID.`,
    );
    return { ok: false, appId: appIdResult, adminToken: adminTokenResult };
  }

  return { ok: true, appId: appIdResult, adminToken: adminTokenResult };
}

function appDashUrl(id) {
  return `${instantDashOrigin}/dash?s=main&t=home&app=${id}`;
}
