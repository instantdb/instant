import { Command, Option } from 'commander';
import * as p from '@clack/prompts';
import { findClaudePath } from './claude.js';
import { version } from '@instantdb/version';
import { coerceAppName, validateAppName } from './utils/validateAppName.js';
import { renderUnwrap, UI } from 'instant-cli/ui';

export type Project = {
  base:
    | 'next-js-app-dir'
    | 'vite-vanilla'
    | 'expo'
    | 'tanstack-start'
    | 'tanstack-start-with-tanstack-query'
    | 'bun-react'
    | 'solidjs-vite'
    | 'vercel-ai-sdk';
  ruleFiles:
    | 'cursor'
    | 'claude'
    | 'codex'
    | 'gemini'
    | 'zed'
    | 'windsurf'
    | null;
  appName: string;
  prompt: string | null;
  createRepo: boolean;
};

export type AppFlags = {
  app: string | null;
  token: string | null;
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
  appName: 'Awesome Todos',
  ruleFiles: null,
  createRepo: true,
  prompt: null,
};

export const runCli = async (): Promise<{
  project: Project;
  appFlags: AppFlags;
}> => {
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
      ).choices([
        'next-js-app-dir',
        'vite-vanilla',
        'expo',
        'bun-react',
        'tanstack-start',
        'tanstack-start-with-tanstack-query',
        'solidjs-vite',
        'vercel-ai-sdk',
      ]),
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
      new Option('--vanilla', 'Use the vanilla JS starter template').default(
        false,
      ),
    )
    .addOption(
      new Option('--no-git', "Don't create a git repo in the new project"),
    )
    .addOption(
      new Option('--cursor', 'Include a Cursor rules file in the scaffold'),
    )
    .addOption(
      new Option('--claude', 'Include a CLAUDE.md file in the scaffold'),
    )
    .addOption(
      new Option('--codex', 'Include an AGENTS.md file in the scaffold'),
    )
    .addOption(
      new Option('--gemini', 'Include a GEMINI.md file in the scaffold'),
    )
    .addOption(
      new Option('--rules', 'Include an AGENTS.md file in the scaffold'),
    )
    .addOption(
      new Option(
        '--ai',
        'Create a new InstantDB app based off of a prompt. (requires Claude Code)',
      ),
    )
    .addOption(
      new Option(
        '-a --app <app-id>',
        'Link to an existing InstantDB app by ID (requires login or --token)',
      ),
    )
    .addOption(
      new Option(
        '-t --token <token>',
        'Auth token override (use with --app when not logged in)',
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
        const promptedName = await renderUnwrap(
          new UI.TextInput({
            prompt: 'What will your project/folder be called?',
            placeholder: 'awesome-todos',
            defaultValue: 'awesome-todos',
            validate: (x) => validateAppName(coerceAppName(x)),
            modifyOutput: UI.ciaModifier(),
          }),
        );
        const coercedName = coerceAppName(promptedName);
        return coercedName;
      },
      prompt: async () => {
        if (flags.ai) {
          return await renderUnwrap(
            new UI.TextInput({
              prompt: 'What would you like to create?',
              placeholder: 'Create an app that...',
              modifyOutput: UI.modifiers.piped([UI.ciaModifier()]),
            }),
          );
        }
        return null;
      },
      base: async ({ results }) => {
        if (flags.base) {
          return flags.base as Project['base'];
        }
        if (flags.vanilla) {
          return 'vite-vanilla';
        }
        if (flags.next) {
          return 'next-js-app-dir';
        }
        if (flags.expo) {
          return 'expo';
        }

        if (results.prompt) {
          return renderUnwrap(
            new UI.Select({
              promptText: 'What framework would you like to use?',
              options: [
                { value: 'next-js-app-dir', label: 'Next.js' },
                { value: 'expo', label: 'Expo: React Native' },
              ],
              defaultValue: 'next-js-app-dir',
              modifyOutput: UI.modifiers.piped([UI.ciaModifier()]),
            }),
          );
        }

        return renderUnwrap(
          new UI.Select({
            promptText: 'What framework would you like to use?',
            options: [
              {
                value: 'next-js-app-dir',
                label: 'Web: Next.js',
              },
              { value: 'expo', label: 'Mobile: Expo' },
              {
                value: 'vite-vanilla',
                label: 'Vite: Vanilla TS',
                secondary: true,
              },
              {
                value: 'tanstack-start',
                label: 'Tanstack Start',
                secondary: true,
              },
              {
                value: 'bun-react',
                label: 'Bun + React',
                secondary: true,
              },
              {
                value: 'solidjs-vite',
                label: 'Vite: SolidJS',
                secondary: true,
              },
              {
                value: 'vercel-ai-sdk',
                label: 'Vercel ai sdk + SSR',
                secondary: true,
              },
            ],
            defaultValue: 'next-js-app-dir' as Project['base'],
            modifyOutput: UI.modifiers.piped([UI.ciaModifier()]),
          }),
        );
      },
      ruleFiles: async ({ results }) => {
        if (results.prompt) {
          return 'claude';
        }

        if (flags.cursor) {
          return 'cursor';
        }
        if (flags.claude) {
          return 'claude';
        }
        if (flags.codex) {
          return 'codex';
        }
        if (flags.gemini) {
          return 'gemini';
        }
        if (flags.rules) {
          return 'codex';
        }

        return renderUnwrap(
          new UI.Select({
            promptText: 'Which AI tool would you like to add rule files for?',
            options: [
              { value: 'claude', label: 'Claude' },
              { value: 'cursor', label: 'Cursor' },
              { value: 'codex', label: 'Codex' },
              { value: 'gemini', label: 'Gemini' },
              { value: 'zed', label: 'Zed' },
              { value: 'windsurf', label: 'Windsurf' },
              { value: null, label: 'None' },
            ],
            defaultValue: 'claude' satisfies Project['ruleFiles'],
            modifyOutput: UI.ciaModifier(),
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

  const appFlags: AppFlags = {
    app: flags.app ?? null,
    token: flags.token ?? null,
  };

  return { project, appFlags };
};
