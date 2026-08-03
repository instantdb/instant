import { expect, test } from 'vitest';
import { oauthCallbackURL } from '../../src/consts.ts';

test('builds an OAuth callback URL from the API origin', () => {
  expect(oauthCallbackURL('https://api.example.com')).toBe(
    'https://api.example.com/runtime/oauth/callback',
  );
  expect(oauthCallbackURL('https://api.example.com/')).toBe(
    'https://api.example.com/runtime/oauth/callback',
  );
});
