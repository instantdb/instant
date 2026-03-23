import { it } from '@effect/vitest';
import { infoCommand } from '../../src/new/commands/info.ts';

it.effect('info command', () => infoCommand());
