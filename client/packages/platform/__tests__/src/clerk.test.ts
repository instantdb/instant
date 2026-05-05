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
});
