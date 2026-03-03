'use client';

import { db } from '@/lib/db';
import { Login } from '@/components/Login';

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <db.SignedIn>{children}</db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </>
  );
}
