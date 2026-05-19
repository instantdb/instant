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
        <ScreenHeading>Let's log you in</ScreenHeading>
        <Content>
          Enter your email, and we’ll send you a verification code. We'll create
          an account for you too if you don't already have one :)
        </Content>
        <TextInput
          className="w-full rounded-sm"
          placeholder="Enter your email address"
          type="email"
          value={email}
          onChange={(v) => setEmail(v)}
        />
        <Button type="submit" disabled={email.trim().length === 0}>
          Send Code
        </Button>
      </form>
      <Divider>
        <span className="mx-4 text-xs text-gray-900 dark:text-neutral-400">
          OR
        </span>
      </Divider>
      <Button variant="secondary" type="link" href="#">
        <span className="flex items-center space-x-2">
          <Image alt="google icon" src={googleIconSvg} width={16} />
          <span>Continue with Google</span>
        </span>
      </Button>
    </AuthShell>
  );
}
