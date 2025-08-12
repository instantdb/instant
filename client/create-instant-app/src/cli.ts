import { Command } from 'commander';
import * as p from '@clack/prompts';

type CliResults = {
  base: 'nextjs' | 'vite' | 'react-native';
  appName: string;
  nextOptions?: {
    routerType: 'app' | 'pages';
  };
};

const defaultOptions: CliResults = {
  base: 'nextjs',
  nextOptions: {
    routerType: 'app',
  },
  appName: 'my-instant-app',
};

export const runCli = async () => {
  const results = defaultOptions;

  const program = new Command()
    .name('Create Instant App')
    .description('A CLI for creating web/mobile applications with InstantDB')
    .argument(
      '[dir]',
      'The name of the application, as well as the name of the directory to create',
    )
    .option(
      '-y, --default',
      'Bypass the CLI and use all default options',
      false,
    )
    .parse(process.argv);
  const cliProvidedName = program.args[0];
  if (cliProvidedName) {
    results.appName = cliProvidedName;
  }

  const flags = program.opts();

  const project = await p.group(
    {
      appName: () => {
        if (cliProvidedName) {
          return new Promise((resolve) => {
            resolve(cliProvidedName);
          });
        }
        return p.text({
          message: 'What will your project be called?',
          placeholder: 'my-instant-app',
          defaultValue: cliProvidedName,
        });
      },
      base: () =>
        p.select({
          message: 'What framework would you like to use?',
          options: [
            { value: 'nextjs', label: 'Next.js' },
            { value: 'vite', label: 'Vite' },
            { value: 'react-native', label: 'React Native' },
          ],
          initialValue: 'nextjs' as CliResults['base'],
        }),
      nextOptions: async ({ results }) => {
        const options = {
          routerType: 'app',
        } satisfies CliResults['nextOptions'];
        return options;
      },
    } satisfies {
      [K in keyof CliResults]: (args: {
        results: Partial<CliResults>;
      }) => Promise<CliResults[K] | symbol>;
    },
    {
      onCancel() {
        process.exit(1);
      },
    },
  );

  return { project, flags };
};
