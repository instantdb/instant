import { test, expect } from 'vitest';
import { transformContent } from '../lib/markdoc';

test('strips unknown tags', () => {
  const input = `---
title: Test
---

Some text before.

{% some-tag %}{% /some-tag %}

Some text after.`;

  const result = transformContent(input);
  expect(result).toContain('Some text before.');
  expect(result).toContain('Some text after.');
  expect(result).not.toContain('some-tag');
});

test('converts nav-button tags to markdown list items', () => {
  const input = `---
title: Auth
---

## Authentication Methods

{% nav-group margin=false %}
{% nav-button href="/docs/auth/magic-codes"
            title="Magic Codes"
            description="Send login codes via email." /%}
{% nav-button href="/docs/auth/google-oauth"
            title="Google OAuth"
            description="Enable Google OAuth for your app." /%}
{% /nav-group %}`;

  const result = transformContent(input);
  expect(result).toContain(
    '- [Magic Codes](/docs/auth/magic-codes): Send login codes via email.',
  );
  expect(result).toContain(
    '- [Google OAuth](/docs/auth/google-oauth): Enable Google OAuth for your app.',
  );
});

test('converts param/value nav-buttons to bold list items', () => {
  const input = `---
title: Sign In with Apple
---

{% nav-group %}
{% nav-button param="method" value="web-popup" title="Web Popup (recommended)" description="Use Apple-provided popup to authenticate users" /%}
{% nav-button param="method" value="web-redirect" title="Web Redirect" description="Use redirect flow to authenticate users" /%}
{% nav-button param="method" value="native" title="React Native" description="Authenticating in React Native app" /%}
{% /nav-group %}`;

  const result = transformContent(input);
  expect(result).toContain(
    '- **Web Popup (recommended)**: Use Apple-provided popup to authenticate users',
  );
  expect(result).toContain(
    '- **Web Redirect**: Use redirect flow to authenticate users',
  );
  expect(result).toContain(
    '- **React Native**: Authenticating in React Native app',
  );
});

test('converts multiline param/value nav-buttons', () => {
  const input = `---
title: Magic Code Auth
---

{% nav-button
  title="Web"
  description="For Next.js or other React frameworks"
  param="platform"
  value="react" /%}
{% nav-button
  title="Mobile"
  description="For Expo and React Native"
  param="platform"
  value="react-native" /%}`;

  const result = transformContent(input);
  expect(result).toContain('- **Web**: For Next.js or other React frameworks');
  expect(result).toContain('- **Mobile**: For Expo and React Native');
});

test('converts blank-link tags to markdown links', () => {
  const input = `---
title: Test
---

From the {% blank-link href="/dash?s=main&t=auth" label="Auth" /%} tab on the Instant dashboard.`;

  const result = transformContent(input);
  expect(result).toContain(
    'From the [Auth](/dash?s=main&t=auth) tab on the Instant dashboard.',
  );
  expect(result).not.toContain('blank-link');
});

test('renders blank-link label as plain text when href is missing', () => {
  const input = `---
title: Test
---

See {% blank-link label="the docs" /%} for details.`;

  const result = transformContent(input);
  expect(result).toContain('See the docs for details.');
  expect(result).not.toContain('blank-link');
});

test('emits "From the dashboard" / "From the terminal" headings for setup-paths', () => {
  const input = `---
title: Test
---

{% setup-paths %}

{% dashboard-path %}

From the {% blank-link href="/dash?s=main&t=auth" label="Auth" /%} tab:

- Click "Set up Google"
- Click "Add Client"

{% /dashboard-path %}

{% terminal-path %}

\`\`\`shell
npx instant-cli@latest auth client add --type google --name google-web
\`\`\`

{% /terminal-path %}

{% /setup-paths %}`;

  const result = transformContent(input);
  expect(result).toContain('**From the dashboard**');
  expect(result).toContain('**From the terminal**');
  expect(result).toContain('From the [Auth](/dash?s=main&t=auth) tab:');
  expect(result).toContain('- Click "Set up Google"');
  expect(result).toContain('npx instant-cli@latest auth client add');
  expect(result).not.toContain('setup-paths');
  expect(result).not.toContain('dashboard-path');
  expect(result).not.toContain('terminal-path');
});
