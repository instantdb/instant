import { FileSystem } from '@effect/platform';
import { Effect } from 'effect';
import { DEFAULT_OAUTH_CALLBACK_URL } from '@instantdb/platform';
import chalk from 'chalk';
import { BadArgsError } from '../../../errors.ts';
import { link } from '../../../logging.ts';
import {
  optOrPrompt,
  stripFirstBlankLine,
  validateRequired,
} from '../../../lib/ui.ts';
import { UI } from '../../../ui/index.ts';

type EmptyPromptArgs = Record<string, never>;

export const getFlag = (opts: Record<string, unknown>, flag: string) =>
  opts[flag];

export const hasFlag = (opts: Record<string, unknown>, flag: string) =>
  flag in opts;

export const hasAnyFlag = (opts: Record<string, unknown>, flags: string[]) =>
  flags.some((flag) => hasFlag(opts, flag));

export const isTrueFlag = (value: unknown) =>
  value === true || value === 'true';

export const getMetaString = (meta: unknown, key: string) => {
  if (!meta || typeof meta !== 'object') return undefined;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

export const optOrPromptIf = (
  opts: Record<string, unknown>,
  flag: string,
  params: {
    promptIf: boolean;
    required?: boolean;
    prompt: UI.TextInputProps;
  },
) =>
  Effect.gen(function* () {
    const value = getFlag(opts, flag);
    if (value === undefined && !params.promptIf) return undefined;
    return yield* optOrPrompt(value, {
      simpleName: `--${flag}`,
      required: params.required ?? params.promptIf,
      skipIf: false,
      prompt: params.prompt,
    });
  });

export const clientIdPrompt = ({ providerUrl }: { providerUrl: string }) => ({
  prompt: `Client ID: ${chalk.dim(`(from ${link(providerUrl)})`)}`,
  validate: validateRequired,
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const clientSecretPrompt = ({
  providerUrl,
}: {
  providerUrl: string;
}) => ({
  prompt: `Client Secret: ${chalk.dim(`(from ${link(providerUrl)})`)}`,
  validate: validateRequired,
  sensitive: true,
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const redirectUriPrompt = ({ heading }: { heading: string }) => ({
  prompt: '',
  placeholder: 'https://yoursite.com/oauth/callback',
  modifyOutput: UI.modifiers.piped([
    (output, status) => {
      if (status === 'idle') {
        return (
          `\n${heading}
${chalk.dim('With a custom redirect URI, users will see "Redirecting to yoursite.com..." for a more branded experience.')}
${chalk.dim(`Your URI must forward to ${DEFAULT_OAUTH_CALLBACK_URL} with all query parameters preserved.`)}\n\n` +
          stripFirstBlankLine(output)
        );
      }
      return `\n${heading}\n${stripFirstBlankLine(output)}`;
    },
    UI.modifiers.dimOnComplete,
  ]),
});

export const redirectSetupMessages = ({
  prompt,
  redirectUri,
  showCustomRedirectInstructions,
}: {
  prompt: string;
  redirectUri: string;
  showCustomRedirectInstructions?: boolean;
}) => {
  const messages = ['', chalk.bold(`${prompt}:`), chalk.bold(redirectUri)];

  if (showCustomRedirectInstructions) {
    messages.push(
      '',
      `Your custom redirect must forward to ${chalk.bold(DEFAULT_OAUTH_CALLBACK_URL)} with all query parameters preserved.`,
    );
    messages.push(
      `You can test it by visiting: ${chalk.bold(redirectUri + '?test-redirect=true')}`,
    );
  }

  return messages;
};

export const appleServicesIdPrompt = (_opts: EmptyPromptArgs) => ({
  prompt: `Services ID ${chalk.dim(`(from ${link('https://developer.apple.com/account/resources/identifiers/list/serviceId')})`)}`,
  validate: validateRequired,
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const appleTeamIdPrompt = (_opts: EmptyPromptArgs) => ({
  prompt: `Team ID ${chalk.dim(`(from ${link('https://developer.apple.com/account#MembershipDetailsCard')})`)}`,
  validate: validateRequired,
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const appleKeyIdPrompt = (_opts: EmptyPromptArgs) => ({
  prompt: `Key ID ${chalk.dim(`(from ${link('https://developer.apple.com/account/resources/authkeys/list')})`)}`,
  validate: validateRequired,
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const applePrivateKeyFilePrompt = (_opts: EmptyPromptArgs) => ({
  prompt: `Path to .p8 private key file ${chalk.dim('(downloaded from Apple)')}`,
  validate: validateRequired,
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const clerkPublishableKeyPrompt = (_opts: EmptyPromptArgs) => ({
  prompt: `Clerk publishable key ${chalk.dim(`(from ${link('https://dashboard.clerk.com/last-active?path=api-keys')})`)}`,
  placeholder: 'pk_********************************************************',
  validate: (val: string) => {
    if (!val) return 'Publishable key is required';
    if (!val.startsWith('pk_')) {
      return 'Invalid publishable key. It should start with "pk_".';
    }
  },
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const firebaseProjectIdPrompt = (_opts: EmptyPromptArgs) => ({
  prompt: `Firebase project ID: (From Project Settings page on ${link('https://console.firebase.google.com/')})`,
  validate: validateFirebaseProjectId,
  modifyOutput: UI.modifiers.piped([
    UI.modifiers.topPadding,
    UI.modifiers.dimOnComplete,
  ]),
});

export const readPrivateKeyFile = Effect.fn('readPrivateKeyFile')(function* (
  path: string,
) {
  const fs = yield* FileSystem.FileSystem;
  // Strip shell escapes so paths like "file\ (2).p8" resolve on POSIX.
  const normalizedPath =
    process.platform === 'win32' ? path : path.replace(/\\(.)/g, '$1');
  const contents = yield* fs.readFileString(normalizedPath, 'utf8').pipe(
    Effect.mapError(
      (e) =>
        new BadArgsError({
          message: `Could not read private key file at ${normalizedPath}: ${e.message}`,
        }),
    ),
  );

  const trimmed = contents.trim();
  if (!trimmed) {
    return yield* BadArgsError.make({
      message: `Private key file at ${normalizedPath} is empty.`,
    });
  }
  return trimmed;
});

export function domainFromClerkKey(key: string): string | null {
  try {
    const parts = key.split('_');
    const domainPartB64 = parts[parts.length - 1];
    const domainPart = base64Decode(domainPartB64);
    return domainPart.replace('$', '');
  } catch {
    return null;
  }
}

function base64Decode(s: string) {
  try {
    return Buffer.from(s, 'base64').toString('utf-8');
  } catch {
    return Buffer.from(s, 'base64url').toString('utf-8');
  }
}

export function validateFirebaseProjectId(value: string) {
  const projectIdRegex = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  if (!value) return 'Project ID is required';
  if (!projectIdRegex.test(value)) {
    return 'Invalid Firebase project ID. It must be 6-30 characters, start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and not end with a hyphen.';
  }
}

export function firebaseDiscoveryEndpoint(projectId: string) {
  return `https://securetoken.google.com/${encodeURIComponent(projectId)}/.well-known/openid-configuration`;
}
