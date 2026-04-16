import { Command, Option } from 'commander';
import * as p from '@clack/prompts';
import { findClaudePath } from './claude.js';
import { version } from '@instantdb/version';
import { coerceAppName, validateAppName } from './utils/validateAppName.js';
import { renderUnwrap, UI } from 'instant-cli/ui';

export type Project = {
  base:
    | 'next-js-app-dir'
    | 'vite-react'
    | 'vite-vanilla'
    | 'expo'
    | 'tanstack-start'
    | 'tanstack-start-with-tanstack-query'
    | 'bun-react'
    | 'solidjs-vite'
    | 'sveltekit'
    | 'vercel-ai-sdk'
    | 'ai-chat';
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
  app: string | null;
  token: string | null;
  yes: boolean;
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
  app: null,
  token: null,
  yes: false,
};

const baseFromFlags = (flags: Record<string, any>): Project['base'] | null =>
  (flags.base as Project['base']) ||
  (flags.viteReact && 'vite-react') ||
  (flags.vanilla && 'vite-vanilla') ||
  (flags.next && 'next-js-app-dir') ||
  (flags.expo && 'expo') ||
  (flags.sv && 'sveltekit') ||
  null;

const ruleFilesFromFlags = (
  flags: Record<string, any>,
): Project['ruleFiles'] | null =>
  (flags.cursor && 'cursor') ||
  (flags.claude && 'claude') ||
  (flags.codex && 'codex') ||
  (flags.gemini && 'gemini') ||
  (flags.rules && 'codex') ||
  null;

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
      ).choices([
        'next-js-app-dir',
        'vite-react',
        'vite-vanilla',
        'expo',
        'bun-react',
        'tanstack-start',
        'tanstack-start-with-tanstack-query',
        'solidjs-vite',
        'sveltekit',
        'vercel-ai-sdk',
        'ai-chat',
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
      new Option(
        '--vite-react',
        'Use the Vite + React starter template',
      ).default(false),
    )
    .addOption(
      new Option('--sv', 'Use the SvelteKit starter template').default(false),
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
    .addOption(
      new Option(
        '-y --yes',
        'Use all defaults (requires project name as first argument)',
      ).default(false),
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

  if (flags.yes) {
    if (flags.ai) {
      throw new Error('--yes is not supported with --ai');
    }
    if (!cliProvidedName) {
      throw new Error(
        'When using --yes, you must specify a project name as the first argument.\n' +
          'Usage: npx create-instant-app my-app --yes',
      );
    }
    return {
      ...defaultOptions,
      appName: cliProvidedName,
      base: baseFromFlags(flags) ?? defaultOptions.base,
      ruleFiles: ruleFilesFromFlags(flags) ?? 'claude',
      createRepo: flags.git ?? defaultOptions.createRepo,
      app: flags.app ?? null,
      token: flags.token ?? null,
      yes: true,
    };
  }

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
        const fromFlags = baseFromFlags(flags);
        if (fromFlags) {
          return fromFlags;
        }

        if (results.prompt) {
          return renderUnwrap(
            new UI.Select({
              promptText: 'What framework would you like to use?',
              options: [
                { value: 'next-js-app-dir', label: 'Web: Next.js' },
                { value: 'vite-react', label: 'Web: Vite React' },
                { value: 'expo', label: 'Mobile: Expo' },
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
                value: 'vite-react',
                label: 'Vite: React',
                secondary: true,
              },
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
                value: 'sveltekit',
                label: 'SvelteKit',
                secondary: true,
              },
              {
                value: 'vercel-ai-sdk',
                label: 'Vercel AI SDK App Builder + SSR',
                secondary: true,
              },
              {
                value: 'ai-chat',
                label: 'Vercel AI SDK Chat App',
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

        const fromFlags = ruleFilesFromFlags(flags);
        if (fromFlags) {
          return fromFlags;
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
      [K in keyof Omit<Project, 'app' | 'token' | 'yes'>]: (args: {
        results: Partial<Project>;
      }) => Promise<Project[K] | symbol> | Project[K];
    },
    {
      onCancel() {
        process.exit(1);
      },
    },
  );

  return {
    ...project,
    app: flags.app ?? null,
    token: flags.token ?? null,
    yes: false,
  };
};
