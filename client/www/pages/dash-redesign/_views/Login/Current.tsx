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
        className="flex flex-col gap-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <ScreenHeading className="text-5xl">Let's log you in</ScreenHeading>
        <Content className="text-2xl leading-9 text-gray-950 dark:text-neutral-200">
          Enter your email, and we’ll send you a verification code. We'll create
          an account for you too if you don't already have one :)
        </Content>
        <TextInput
          autoFocus
          size="jumbo"
          className="pr-14"
          placeholder="Enter your email"
          type="email"
          ignorePasswordManagers
          value={email}
          onChange={(v) => setEmail(v)}
        />
        <Button size="jumbo" type="submit" disabled={email.trim().length === 0}>
          Send code
        </Button>
      </form>
      <Divider>
        <span className="mx-4 text-base text-gray-500 dark:text-neutral-400">
          or
        </span>
      </Divider>
      <Button size="jumbo" variant="secondary" type="link" href="#">
        <span className="flex items-center gap-4">
          <Image alt="google icon" src={googleIconSvg} width={28} />
          <span>Continue with Google</span>
        </span>
      </Button>
    </AuthShell>
  );
}
