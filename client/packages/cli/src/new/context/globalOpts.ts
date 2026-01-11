import { program } from 'commander';
import { Context, Effect, Layer } from 'effect';

export class GlobalOpts extends Context.Tag(
  'instant-cli/new/context/globalOpts',
)<
  GlobalOpts,
  {
    token?: string;
    yes: boolean;
    env?: string;
  }
>() {}

export const GlobalOptsLive = Layer.effect(
  GlobalOpts,
  Effect.gen(function* () {
    return {
      yes: program.optsWithGlobals()?.yes || false,
    };
  }),
);
