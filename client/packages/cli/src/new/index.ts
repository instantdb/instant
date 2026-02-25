import { Command, Option, program } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { Effect } from 'effect';
import version from '../version.js';
import { initCommand } from './commands/init.js';
import { initWithoutFilesCommand } from './commands/initWithoutFiles.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { loadEnv } from '../util/loadEnv.js';
import {
  AuthLayerLive,
  BaseLayerLive,
  printRedErrors,
  WithAppLayer,
} from './layer.js';
import { infoCommand } from './commands/info.js';

loadEnv();

export type ArgsFromCommand<C> =
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
    '-p --package <react|react-native|core|admin>',
    'Which package to automatically install if there is not one installed already.',
  )
  .option('--title <title>', 'Title for the created app')
  .action((options) => {
    return Effect.runPromise(initCommand(options).pipe(printRedErrors));
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
    return Effect.runPromise(
      initWithoutFilesCommand(opts).pipe(
        Effect.provide(AuthLayerLive),
        printRedErrors,
      ),
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
    Effect.runPromise(
      loginCommand(opts).pipe(Effect.provide(BaseLayerLive), printRedErrors),
    );
  });

const _logoutDef = program
  .command('logout')
  .description('Log out of your Instant account')
  .action(async () => {
    Effect.runPromise(
      logoutCommand().pipe(Effect.provide(BaseLayerLive), printRedErrors),
    );
  });

export const infoDef = program
  .command('info')
  .description('Display CLI version and login status')
  .action(async () => {
    Effect.runPromise(infoCommand().pipe(printRedErrors));
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

program.parse(process.argv);
