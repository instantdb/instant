import { useState } from 'react';
import { Button, Content, ScreenHeading, TextInput } from '@/components/ui';
import { AuthShell } from '../_shared';

export function Current() {
  const [code, setCode] = useState('');
  const sentEmail = 'sto.pa@instantdb.com';
  return (
    <AuthShell>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <ScreenHeading className="text-3xl">Enter your code</ScreenHeading>
        <Content className="text-base leading-6 text-gray-600 dark:text-neutral-400">
          We sent an email to{' '}
          <strong className="dark:text-white">{sentEmail}</strong>. Check your
          email, and paste the code you see.
        </Content>
        <TextInput
          autoFocus
          size="large"
          className="appearance-none outline-hidden"
          placeholder="Your code"
          inputMode="numeric"
          value={code}
          onChange={(v) => setCode(v)}
        />
        <Button size="large" type="submit" disabled={code.trim().length === 0}>
          Verify code
        </Button>
        <Button variant="subtle" onClick={() => {}}>
          Back to login
        </Button>
      </form>
    </AuthShell>
  );
}
