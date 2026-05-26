import { useState } from 'react';
import Image from 'next/image';
import googleIconSvg from '../../../../public/img/google_g.svg';
import {
  Button,
  Content,
  Divider,
  ScreenHeading,
  TextInput,
} from '@/components/ui';
import { AuthShell } from '../_shared';

export function Current() {
  const [email, setEmail] = useState('');
  return (
    <AuthShell>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <ScreenHeading className="text-3xl">Let's log you in</ScreenHeading>
        <Content className="text-base leading-6 text-gray-600 dark:text-neutral-400">
          Enter your email, and we’ll send you a verification code. We'll create
          an account for you too if you don't already have one :)
        </Content>
        <TextInput
          autoFocus
          size="large"
          placeholder="Enter your email"
          type="email"
          ignorePasswordManagers
          value={email}
          onChange={(v) => setEmail(v)}
        />
        <Button size="large" type="submit" disabled={email.trim().length === 0}>
          Send code
        </Button>
      </form>
      <Divider>
        <span className="mx-4 text-sm text-gray-500 dark:text-neutral-400">
          or
        </span>
      </Divider>
      <Button size="large" variant="secondary" type="link" href="#">
        <span className="flex items-center gap-2.5">
          <Image alt="google icon" src={googleIconSvg} width={20} />
          <span>Continue with Google</span>
        </span>
      </Button>
    </AuthShell>
  );
}
