import { expect, test } from 'vitest';
import stripAnsi from 'strip-ansi';
import { redirectUriPrompt } from '../src/commands/auth/client/shared.ts';

test('redirectUriPrompt shows skipped when submitted empty', () => {
  const prompt = redirectUriPrompt({ heading: 'Custom redirect URI (optional):' });

  const output = stripAnsi(prompt.modifyOutput!('\n', 'submitted'));

  expect(output).toContain('Custom redirect URI (optional):\n(skipped)');
});

test('redirectUriPrompt shows submitted custom redirect URI', () => {
  const prompt = redirectUriPrompt({ heading: 'Custom redirect URI (optional):' });

  const output = stripAnsi(
    prompt.modifyOutput!(
      '\nhttps://example.com/oauth/callback',
      'submitted',
    ),
  );

  expect(output).toContain(
    'Custom redirect URI (optional):\nhttps://example.com/oauth/callback',
  );
});
