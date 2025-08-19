import { Command, Option } from 'commander';
import * as p from '@clack/prompts';

export type CliResults = {
  base: 'next-js-app-dir' | 'vite-vanilla' | 'expo';
  appName: string;
  ruleFiles: ('cursor' | 'claude' | 'windsurf' | 'zed')[];
};

const defaultOptions: CliResults = {
  base: 'next-js-app-dir',
  appName: 'my-instant-app',
  ruleFiles: [],
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
      base: async () => {
        if (flags.base) {
          return flags.base;
        }

        return p.select({
          message: 'What framework would you like to use?',
          options: [
            { value: 'next-js-app-dir', label: 'Next.js (App Directory)' },
            { value: 'vite-vanilla', label: 'Vanilla JS (Vite)' },
            { value: 'expo', label: 'React Native (Expo)' },
          ],
          initialValue: 'nextjs' as CliResults['base'],
        });
      },
      ruleFiles: () => {
        return p.multiselect({
          required: false,
          message: `Which AI tools would you like to add rule files for? (select multiple)`,
          options: [
            { value: 'cursor', label: 'Cursor' },
            { value: 'claude', label: 'Claude' },
            { value: 'windsurf', label: 'Windsurf' },
            { value: 'zed', label: 'Zed' },
          ],
          initialValues: [] as CliResults['ruleFiles'],
        });
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
