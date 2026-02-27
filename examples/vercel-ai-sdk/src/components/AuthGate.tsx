'use client';

import { db } from '@/lib/db';
import { Login } from '@/components/Login';
import { usePathname } from 'next/navigation';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/preview/')) {
    return <>{children}</>;
  }

  return (
    <>
      <db.SignedIn>{children}</db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </>
  );
}
