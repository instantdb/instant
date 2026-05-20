import { useState } from 'react';
import { Button, Content, ScreenHeading, TextInput } from '@/components/ui';
import { AuthShell } from '../_shared';

export function Current() {
  const [code, setCode] = useState('');
  const sentEmail = 'sto.pa@instantdb.com';
  return (
    <AuthShell>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <ScreenHeading className="text-5xl">Enter your code</ScreenHeading>
        <Content className="text-2xl leading-9 text-gray-950 dark:text-neutral-200">
          We sent an email to{' '}
          <strong className="dark:text-white">{sentEmail}</strong>. Check your
          email, and paste the code you see.
        </Content>
        <TextInput
          autoFocus
          size="jumbo"
          className="appearance-none outline-hidden"
          placeholder="Your code"
          inputMode="numeric"
          value={code}
          onChange={(v) => setCode(v)}
        />
        <Button size="jumbo" type="submit" disabled={code.trim().length === 0}>
          Verify code
        </Button>
        <Button size="large" variant="subtle" onClick={() => {}}>
          Back to login
        </Button>
      </form>
    </AuthShell>
  );
}
