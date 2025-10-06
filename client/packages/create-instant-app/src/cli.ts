import { Command, Option } from 'commander';
import * as p from '@clack/prompts';
import { findClaudePath } from './claude.js';
import { version } from '@instantdb/version';
import { coerceAppName, validateAppName } from './utils/validateAppName.js';

export type Project = {
  base: 'next-js-app-dir' | 'vite-vanilla' | 'expo';
  ruleFiles: 'cursor' | 'claude' | 'windsurf' | 'zed' | 'codex' | null;
  appName: string;
  prompt: string | null;
  createRepo: boolean;
};

export const unwrapSkippablePrompt = <T>(result: Promise<T | symbol>) => {
  return result.then((value) => {
    if (p.isCancel(value)) {
      throw new Error('Cancelled');
    }
    return value;
  }) satisfies Promise<T>;
};

const defaultOptions: Project = {
  base: 'next-js-app-dir',
  appName: 'awesome-todos',
  ruleFiles: null,
  createRepo: true,
  prompt: null,
};

export const runCli = async (): Promise<Project> => {
  const results = defaultOptions;

  const program = new Command()
    .name('Create Instant App')
    .description('A CLI for creating web/mobile applications with InstantDB')
    .argument(
      '[dir]',
      'The name of the application, as well as the name of the directory to create',
    )
    .addOption(
      new Option(
        '-b --base <template>',
        'The base template to scaffold from',
      ).choices(['next-js-app-dir', 'vite-vanilla', 'expo']),
    )
    .addOption(
      new Option('-g --git', 'Create a git repo in the new project').default(
        true,
      ),
    )
    .addOption(
      new Option('--expo', 'Use the Expo starter template').default(false),
    )
    .addOption(
      new Option('--next', 'Use the NextJS starter template').default(false),
    )
    .addOption(
      new Option('--no-git', "Don't create a git repo in the new project"),
    )
    .addOption(
      new Option(
        '--ai',
        'Create a new InstantDB app based off of a prompt. (requires Claude Code)',
      ),
    )
    .version(version)
    .parse(process.argv);
  const cliProvidedName = program.args[0] && coerceAppName(program.args[0]);
  if (cliProvidedName) {
    const validationErr = validateAppName(cliProvidedName);
    if (validationErr) {
      throw new Error('Invalid app name: ' + validationErr);
    }

    results.appName = cliProvidedName;
  }

  const flags = program.opts();

  // Check if claude is in path
  if (flags.ai) {
    const claudePath = await findClaudePath();
    if (!claudePath) {
      throw new Error(
        "--ai only works with Claude Code, but we couldn't find it in your machine. Install it first, and run it again : ). Alternatively you can scaffold out a project without --ai",
      );
    }
  }

  const project = await p.group(
    {
      appName: async () => {
        if (cliProvidedName) {
          return cliProvidedName.trim();
        }
        const promptedName = await unwrapSkippablePrompt(
          p.text({
            message: 'What will your project/folder be called?',
            placeholder: 'awesome-todos',
            defaultValue: 'awesome-todos',
            validate: (x) => validateAppName(coerceAppName(x)),
          }),
        );
        const coercedName = coerceAppName(promptedName);
        return coercedName;
      },
      prompt: async () => {
        if (flags.ai) {
          return await unwrapSkippablePrompt(
            p.text({
              message: 'What is the prompt?',
              placeholder: 'Create an app that....',
            }),
          );
        }
        return null;
      },
      base: async ({ results }) => {
        if (flags.base) {
          return flags.base as Project['base'];
        }
        if (flags.next) {
          return 'next-js-app-dir';
        }
        if (flags.expo) {
          return 'expo';
        }

        if (results.prompt) {
          return unwrapSkippablePrompt(
            p.select({
              message: 'What framework would you like to use?',
              options: [
                { value: 'next-js-app-dir', label: 'Next.js' },
                { value: 'expo', label: 'Expo: React Native' },
              ],
              initialValue: 'next-js-app-dir',
            }),
          );
        }

        return unwrapSkippablePrompt(
          p.select({
            message: 'What framework would you like to use?',
            options: [
              { value: 'next-js-app-dir', label: 'Next.js' },
              { value: 'vite-vanilla', label: 'Vite: Vanilla TS' },
              { value: 'expo', label: 'Expo: React Native' },
            ],
            initialValue: 'next-js-app-dir' as Project['base'],
          }),
        );
      },
      ruleFiles: async ({ results }) => {
        if (results.prompt) {
          return 'claude';
        }

        // Only ask about rule files if the base supports it
        if (results.base !== 'next-js-app-dir' && results.base !== 'expo') {
          return null;
        }

        return unwrapSkippablePrompt(
          p.select({
            message: 'Which AI tool would you like to add rule files for?',
            options: [
              { value: null, label: 'None' },
              { value: 'cursor', label: 'Cursor' },
              { value: 'claude', label: 'Claude' },
              { value: 'windsurf', label: 'Windsurf' },
              { value: 'codex', label: 'Codex' },
              { value: 'zed', label: 'Zed' },
            ],
            initialValue: null as Project['ruleFiles'],
          }),
        );
      },
      createRepo: async () => {
        if (flags.git !== undefined) {
          return flags.git as boolean;
        }
        return true;
      },
    } satisfies {
      [K in keyof Project]: (args: {
        results: Partial<Project>;
      }) => Promise<Project[K] | symbol> | Project[K];
    },
    {
      onCancel() {
        process.exit(1);
      },
    },
  );

  return project;
};
