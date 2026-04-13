import { loadEnv } from './util/loadEnv.ts';
loadEnv();

import { Command, Option } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { Effect, Layer } from 'effect';
import version from './version.js';
import { initCommand } from './commands/init.ts';
import { initWithoutFilesCommand } from './commands/initWithoutFiles.ts';
import { loginCommand } from './commands/login.ts';
import { logoutCommand } from './commands/logout.ts';
import {
  AuthLayerLive,
  BaseLayerLive,
  runCommandEffect,
  WithAppLayer,
} from './layer.ts';
import { infoCommand } from './commands/info.ts';
import { pullCommand } from './commands/pull.ts';
import type { SchemaPermsOrBoth } from './commands/pull.ts';
import { claimCommand } from './commands/claim.ts';
import { pushCommand } from './commands/push.ts';
import { explorerCmd } from './commands/explorer.ts';
import { queryCmd } from './commands/query.ts';
import { program } from './program.ts';
import { PACKAGE_ALIAS_AND_FULL_NAMES } from './context/projectInfo.ts';
import { authClientAddCmd } from './commands/auth/client/add.ts';
import { authClientListCmd } from './commands/auth/client/list.ts';
import { authClientDeleteCmd } from './commands/auth/client/delete.ts';

export type OptsFromCommand<C> =
  C extends Command<any, infer R, any> ? R : never;

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

// Command List
export const initDef = program
  .command('init')
  .description('Set up a new project.')
  .option(
    '-a --app <app-id>',
    'If you have an existing app ID, we can pull schema and perms from there.',
  )
  .option(
    '-p --package <react|react-native|core|admin|solid|svelte>',
    'Which package to automatically install if there is not one installed already.',
  )
  .option('--title <title>', 'Title for the created app')
  .option(
    '--temp',
    'Create a temporary app which will automatically delete itself after >24 hours.',
  )
  .action((options) => {
    return runCommandEffect(
      initCommand(options).pipe(
        Effect.provide(
          WithAppLayer({
            coerce: true,
            coerceAuth: true,
            title: options.title,
            appId: options.app,
            packageName: options.package as any,
            applyEnv: true,
            temp: options.temp,
          }),
        ),
      ),
    );
  });

const auth = program.command('auth');
const authClient = auth.command('client');
export const authClientAddDef = authClient
  .command('add')
  .option(
    '--type <google|apple|github|linkedin|clerk|firebase>',
    'Type of oauth client to add',
  )
  .option('--name', 'Custom name for to identy the OAuth client')
  .option(
    '-a --app <app-id>',
    'App ID to modify. Defaults to *_INSTANT_APP_ID in .env',
  )
  .addHelpText(
    'after',
    `
Provider Specific Options:
  Google:
   --appType       web|ios|android|button-for-web
   --clientName                        (web only)
   --clientSecret                      (web only)
   --skipNonceChecks       (iOS and Android only)
   --customRedirectUri       (optional, web only)
`,
  )
  .allowUnknownOption(true)
  .action((opts) => {
    return runCommandEffect(
      authClientAddCmd(opts).pipe(
        Effect.provide(
          WithAppLayer({
            coerce: false,
            coerceAuth: false,
            appId: opts.app,
            allowAdminToken: true,
          }),
        ),
      ),
    );
  });
export const authClientListDef = authClient
  .command('list')
  .option(
    '-a --app <app-id>',
    'App ID to list clients for. Defaults to *_INSTANT_APP_ID in .env',
  )
  .option('--json', 'Enable JSON output')
  .allowUnknownOption(true)
  .action((opts) => {
    return runCommandEffect(
      authClientListCmd(opts).pipe(
        Effect.provide(
          WithAppLayer({
            coerce: false,
            coerceAuth: false,
            appId: opts.app,
            allowAdminToken: true,
          }),
        ),
      ),
    );
  });

export const authClientDeleteDef = authClient
  .command('delete')
  .option('--id <client-id>', 'Client ID to delete')
  .option('--name <client-name>', 'Client name to delete')
  .option(
    '-a --app <app-id>',
    'App ID to delete a client from. Defaults to *_INSTANT_APP_ID in .env',
  )
  .action((opts) => {
    return runCommandEffect(
      authClientDeleteCmd(opts).pipe(
        Effect.provide(
          WithAppLayer({
            coerce: false,
            appId: opts.app,
            allowAdminToken: true,
          }),
        ),
      ),
    );
  });

export const initWithoutFilesDef = program
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
  .action((opts) => {
    return runCommandEffect(
      initWithoutFilesCommand(opts).pipe(Effect.provide(BaseLayerLive)),
    );
  });

export const loginDef = program
  .command('login')
  .description('Log into your account')
  .option('-p --print', 'Prints the auth token into the console.')
  .option(
    '--headless',
    'Print the login URL instead of trying to open the browser',
  )
  .action(async (opts) => {
    await runCommandEffect(
      loginCommand(opts).pipe(Effect.provide(BaseLayerLive)),
    );
  });

program
  .command('logout')
  .description('Log out of your Instant account')
  .action(async () => {
    return runCommandEffect(
      logoutCommand().pipe(Effect.provide(BaseLayerLive)),
    );
  });

export const infoDef = program
  .command('info')
  .description('Display CLI version and login status')
  .action(async () => {
    return runCommandEffect(
      infoCommand().pipe(
        Effect.provide(
          AuthLayerLive({
            coerce: false,
            allowAdminToken: false,
          }).pipe(Layer.catchAll(() => Layer.empty)), // make the auth layer optional
        ),
      ),
    );
  });

export const explorerDef = program
  .command('explorer')
  .description('Opens the Explorer in your browser')
  .option(
    '-a --app <app-id>',
    'App ID to open the explorer to. Defaults to *_INSTANT_APP_ID in .env',
  )
  .action(async (opts) => {
    return runCommandEffect(
      explorerCmd(opts).pipe(
        Effect.provide(
          WithAppLayer({
            coerce: true,
            coerceAuth: true,
            appId: opts.app,
          }),
        ),
      ),
    );
  });

export const queryDef = program
  .command('query')
  .argument('<query>', 'InstaQL query as JSON/JSON5')
  .option(
    '-a --app <app-id>',
    'App ID to query. Defaults to *_INSTANT_APP_ID in .env',
  )
  .option('--admin', 'Run the query as admin (bypasses permissions)')
  .option('--as-email <email>', 'Run the query as a specific user by email')
  .option('--as-guest', 'Run the query as an unauthenticated guest')
  .option(
    '--as-token <refresh-token>',
    'Run the query as a user identified by refresh token',
  )
  .description('Run an InstaQL query against your app.')
  .action(async function (queryArg, opts) {
    return runCommandEffect(queryCmd(queryArg, opts));
  });

export const pullDef = program
  .command('pull')
  .argument(
    '[schema|perms|all]',
    'Which configuration to pull. Defaults to `all`',
  )
  .option(
    '-a --app <app-id>',
    'App ID to pull to. Defaults to *_INSTANT_APP_ID in .env',
  )
  .option(
    '-p --package <react|react-native|core|admin|solid|svelte>',
    'Which package to automatically install if there is not one installed already.',
  )
  .option(
    '--experimental-type-preservation',
    "[Experimental] Preserve manual type changes like `status: i.json<'online' | 'offline'>()` when doing `instant-cli pull schema`",
  )
  .description('Pull schema and perm files from production.')
  .addHelpText(
    'after',
    `
Environment Variables:
  INSTANT_SCHEMA_FILE_PATH    Override schema file location (default: instant.schema.ts)
  INSTANT_PERMS_FILE_PATH     Override perms file location (default: instant.perms.ts)
`,
  )
  .action(async function (arg, inputOpts) {
    return runCommandEffect(
      pullCommand(arg as SchemaPermsOrBoth, inputOpts).pipe(
        Effect.provide(
          WithAppLayer({
            coerce: true,
            packageName: inputOpts.package as
              | 'react'
              | 'react-native'
              | 'core'
              | 'admin'
              | undefined,
            appId: inputOpts.app,
          }),
        ),
      ),
    );
  });

export const pushDef = program
  .command('push')
  .argument(
    '[schema|perms|all]',
    'Which configuration to push. Defaults to `all`',
  )
  .option(
    '-a --app <app-id>',
    'App ID to push to. Defaults to *_INSTANT_APP_ID in .env',
  )
  .option(
    '--skip-check-types',
    "Don't check types on the server when pushing schema",
  )
  .option(
    '--rename [renames...]',
    'List of full attribute names separated by a ":"\n Example:`push --rename posts.author:posts.creator stores.owner:stores.manager`',
  )
  .option(
    '-p --package <react|react-native|core|admin|solid|svelte>',
    'Which package to automatically install if there is not one installed already.',
  )
  .description('Push schema and perm files to production.')
  .addHelpText(
    'after',
    `
Environment Variables:
  INSTANT_SCHEMA_FILE_PATH    Override schema file location (default: instant.schema.ts)
  INSTANT_PERMS_FILE_PATH     Override perms file location (default: instant.perms.ts)
`,
  )
  .action(async function (arg, inputOpts) {
    return runCommandEffect(
      pushCommand(arg, inputOpts).pipe(
        Effect.provide(
          WithAppLayer({
            coerce: false,
            appId: inputOpts.app,
            coerceLibraryInstall: true,
            coerceAuth: false,
            allowAdminToken: true,
            applyEnv: true,
            packageName:
              inputOpts.package as keyof typeof PACKAGE_ALIAS_AND_FULL_NAMES,
          }),
        ),
      ),
    );
  });

export const claimDef = program
  .command('claim')
  .description('Transfer a temporary app into your Instant account')
  .option(
    '-a --app <app-id>',
    'App to claim. Defaults to *_INSTANT_APP_ID in .env',
  )
  .action(async function (opts) {
    return runCommandEffect(
      claimCommand.pipe(
        Effect.provide(
          WithAppLayer({
            coerce: false,
            allowAdminToken: false,
            appId: opts.app,
            applyEnv: false,
          }),
        ),
      ),
    );
  });
//// Program setup /////

function globalOption(
  flags: string,
  description?: string,
  argParser?: (value: string, prev?: unknown) => unknown,
) {
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

function getLocalAndGlobalOptions(cmd: any, helper: any) {
  const mixOfLocalAndGlobal = helper.visibleOptions(cmd);
  const localOptionsFromMix = mixOfLocalAndGlobal.filter(
    (option: any) => !option.__global,
  );
  const globalOptionsFromMix = mixOfLocalAndGlobal.filter(
    (option: any) => option.__global,
  );
  const globalOptions = helper.visibleGlobalOptions(cmd);

  return [localOptionsFromMix, globalOptionsFromMix.concat(globalOptions)];
}

function formatHelp(
  this: { showGlobalOptions: boolean },
  cmd: any,
  helper: any,
) {
  const termWidth = helper.padWidth(cmd, helper);
  const helpWidth = helper.helpWidth || 80;
  const itemIndentWidth = 2;
  const itemSeparatorWidth = 2; // between term and description
  function formatItem(term: string, description: string | undefined) {
    if (description) {
      const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
      return helper.boxWrap(
        fullText,
        helpWidth - itemIndentWidth,
        termWidth + itemSeparatorWidth,
      );
    }
    return term;
  }
  function formatList(textArray: string[]) {
    return textArray.join('\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
  }

  // Usage
  let output = [`${helper.commandUsage(cmd)}`, ''];

  // Description
  const commandDescription = helper.commandDescription(cmd);
  if (commandDescription.length > 0) {
    output = output.concat([
      helper.boxWrap(commandDescription, helpWidth, 0),
      '',
    ]);
  }

  // Arguments
  const argumentList = helper.visibleArguments(cmd).map((argument: any) => {
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
  const optionList = visibleOptions.map((option: any) => {
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
  const commandList = helper.visibleCommands(cmd).map((cmd: any) => {
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
    const globalOptionList = visibleGlobalOptions.map((option: any) => {
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

program.parse(process.argv);
