import { Context, Effect, Layer } from 'effect';
import { program } from '../program.js';

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

export const GlobalOptsLive = Layer.sync(GlobalOpts, () => {
  const opts = program.optsWithGlobals() as Record<string, any>;
  return {
    yes: opts?.yes || false,
    token: opts?.token,
    env: opts?.env,
  };
});
