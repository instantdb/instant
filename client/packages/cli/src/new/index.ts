import { Args, CliConfig, Command, HelpDoc, Span } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Help, program } from 'commander';
import { Console, Effect, Layer } from 'effect';
import version from '../version.js';

const appIdArg = Args.text({ name: 'appId' }).pipe(
  Args.optional,
  Args.withDescription('The ID for the app to use'),
);
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
const init = Command.make('init', { appIdArg }, ({ appIdArg }) =>
  Effect.gen(function* () {
    yield* Effect.log('hi');
  }),
).pipe(Command.withDescription(HelpDoc.p('Init the project')));

const cliCommand = Command.make('instant-cli').pipe(
  Command.withSubcommands([init]),
);
const cli = Command.run(cliCommand, {
  name: 'instant-cli',
  version: '1.0.0',
  executable: 'instant-cli',
  footer: HelpDoc.empty,
  summary: Span.empty,
});

const cliAndNodeLayer = Layer.merge(
  CliConfig.layer({ showBuiltIns: false }),
  NodeContext.layer,
);

NodeRuntime.runMain(cli(process.argv).pipe(Effect.provide(cliAndNodeLayer)));
