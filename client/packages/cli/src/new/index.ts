import { Args, CliConfig, Command, HelpDoc, Options } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Console, Effect, Layer } from 'effect';

const name = Args.text({ name: 'name' }).pipe(Args.withDefault('World'));
const shout = Options.boolean('shout').pipe(Options.withAlias('s'));

const greet = Command.make('greet', { name, shout }, ({ name, shout }) => {
  const message = `Hello, ${name}!`;
  return Console.log(shout ? message.toUpperCase() : message);
}).pipe(Command.withDescription(HelpDoc.empty));

const cli = Command.run(greet, {
  name: 'instant-cli',
  version: '1.0.0',
  footer: HelpDoc.empty,
  executable: 'instant-cli',
});

const cliAndNodeLayer = Layer.merge(
  CliConfig.layer({ showBuiltIns: false }),
  NodeContext.layer,
);

// Node context provides services for filesystem ops, popen, terminal input, etc.
NodeRuntime.runMain(cli(process.argv).pipe(Effect.provide(cliAndNodeLayer)));
