import { NodeContext } from '@effect/platform-node';
import chalk from 'chalk';
import { Effect, Layer } from 'effect';

export const nodeLayer = Layer.merge(NodeContext.layer);

export const printRedErrors = (e: { message: string }) =>
  Effect.gen(function* () {
    console.error(chalk.red(e.message));
  });
