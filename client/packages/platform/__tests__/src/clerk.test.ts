import { describe, expect, test } from 'vitest';

import { clerkDomainFromPublishableKey } from '../../src/clerk';

describe('clerkDomainFromPublishableKey', () => {
  test('extracts the domain from a Clerk publishable key', () => {
    expect(
      clerkDomainFromPublishableKey(
        'pk_test_Z3VpZGluZy1wZWdhc3VzLTkzLmNsZXJrLmFjY291bnRzLmRldiQ',
      ),
    ).toBe('guiding-pegasus-93.clerk.accounts.dev');
  });

  test('keeps underscores inside the encoded Clerk payload suffix', () => {
    const encodedDomain = Buffer.from('https://example.com/?$').toString(
      'base64url',
    );

    expect(encodedDomain).toContain('_');
    expect(clerkDomainFromPublishableKey(`pk_test_${encodedDomain}`)).toBe(
      'https://example.com/?',
    );
  });
});
