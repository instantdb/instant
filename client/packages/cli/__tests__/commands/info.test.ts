import { it } from '@effect/vitest';
import { infoCommand } from '../../src/new/commands/info.js';

it.effect('info command', () => infoCommand());
