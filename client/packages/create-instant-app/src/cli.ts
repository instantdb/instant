import { Command, Option } from 'commander';
import * as p from '@clack/prompts';

export type CliResults = {
  base: 'next-js-app-dir' | 'vite-vanilla' | 'expo';
  ruleFiles: ('cursor' | 'claude' | 'windsurf' | 'zed' | 'codex')[];
  appName: string;
  prompt: string | null;
  createRepo: boolean;
};

const defaultOptions: CliResults = {
  base: 'next-js-app-dir',
  appName: 'my-instant-app',
  ruleFiles: [],
  createRepo: true,
  prompt: null,
};

export const runCli = async (): Promise<CliResults> => {
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
      new Option('--no-git', "Don't create a git repo in the new project"),
    )
    .addOption(
      new Option(
        '--prompt',
        'Create a fresh InstantDB app based off of a prompt. (requires Claude Code)',
      ),
    )
    .parse(process.argv);
  const cliProvidedName = program.args[0];
  if (cliProvidedName) {
    results.appName = cliProvidedName;
  }

  const flags = program.opts();

  const project = await p.group(
    {
      appName: async () => {
        if (cliProvidedName) {
          return cliProvidedName;
        }
        return p.text({
          message: 'What will your project be called?',
          placeholder: 'my-instant-app',
          defaultValue: 'my-instant-app',
        });
      },
      prompt: async () => {
        if (flags.prompt) {
          return await p
            .text({
              message: 'What is the prompt?',
              placeholder: 'Create an app that....',
            })
            .then((value) => {
              if (p.isCancel(value)) return null;
              return value;
            });
        }
        return null;
      },
      base: async ({ results }) => {
        if (results.prompt) {
          return 'next-js-app-dir';
        }
        if (flags.base) {
          return flags.base;
        }

        return p.select({
          message: 'What framework would you like to use?',
          options: [
            { value: 'next-js-app-dir', label: 'Next.js: App Directory' },
            { value: 'vite-vanilla', label: 'Vite: Vanilla TS' },
            { value: 'expo', label: 'Expo: React Native' },
          ],
          initialValue: 'next-js-app-dir' as CliResults['base'],
        });
      },
      ruleFiles: async ({ results }) => {
        if (results.prompt) {
          return ['claude'];
        }
        return p.multiselect({
          required: false,
          message: `Which AI tools would you like to add rule files for? (select multiple)`,
          options: [
            { value: 'cursor', label: 'Cursor' },
            { value: 'claude', label: 'Claude' },
            { value: 'windsurf', label: 'Windsurf' },
            { value: 'codex', label: 'Codex' },
            { value: 'zed', label: 'Zed' },
          ],
          initialValues: [] as CliResults['ruleFiles'],
        });
      },
      createRepo: async () => {
        if (flags.git !== undefined) {
          return flags.git;
        }
      },
    } satisfies {
      [K in keyof CliResults]: (args: {
        results: Partial<CliResults>;
      }) => Promise<CliResults[K] | symbol> | CliResults[K];
    },
    {
      onCancel() {
        process.exit(1);
      },
    },
  );

  return project;
};
