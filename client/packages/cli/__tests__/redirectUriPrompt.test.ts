import { expect, test } from 'vitest';
import stripAnsi from 'strip-ansi';
import { redirectUriPrompt } from '../src/commands/auth/client/shared.ts';

test('redirectUriPrompt shows the configured callback URL', () => {
  const prompt = redirectUriPrompt({
    heading: 'Custom redirect URI (optional):',
    oauthCallbackURL: 'https://api.example.com/runtime/oauth/callback',
  });

  const output = stripAnsi(prompt.modifyOutput!('\n', 'idle'));

  expect(output).toContain('https://api.example.com/runtime/oauth/callback');
});

test('redirectUriPrompt shows skipped when submitted empty', () => {
  const prompt = redirectUriPrompt({
    heading: 'Custom redirect URI (optional):',
    oauthCallbackURL: 'https://api.example.com/runtime/oauth/callback',
  });

  const output = stripAnsi(prompt.modifyOutput!('\n', 'submitted'));

  expect(output).toContain('Custom redirect URI (optional):\n(skipped)');
});

test('redirectUriPrompt shows submitted custom redirect URI', () => {
  const prompt = redirectUriPrompt({
    heading: 'Custom redirect URI (optional):',
    oauthCallbackURL: 'https://api.example.com/runtime/oauth/callback',
  });

  const output = stripAnsi(
    prompt.modifyOutput!('\nhttps://example.com/oauth/callback', 'submitted'),
  );

  expect(output).toContain(
    'Custom redirect URI (optional):\nhttps://example.com/oauth/callback',
  );
});
