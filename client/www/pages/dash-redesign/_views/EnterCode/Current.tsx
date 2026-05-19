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
        <ScreenHeading>Enter your code</ScreenHeading>
        <Content>
          We sent an email to{' '}
          <strong className="dark:text-white">{sentEmail}</strong>. Check your
          email, and paste the code you see.
        </Content>
        <TextInput
          className="w-full appearance-none rounded-sm outline-hidden"
          placeholder="Your code"
          inputMode="numeric"
          value={code}
          onChange={(v) => setCode(v)}
        />
        <Button type="submit" disabled={code.trim().length === 0}>
          Verify Code
        </Button>
        <Button variant="subtle" onClick={() => {}}>
          Back to Login
        </Button>
      </form>
    </AuthShell>
  );
}
