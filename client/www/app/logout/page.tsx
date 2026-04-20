'use client';

import { useEffect } from 'react';
import { signOut } from '@/lib/auth';

export default function LogoutPage() {
  useEffect(() => {
    signOut().finally(() => {
      window.location.replace('/');
    });
  }, []);

  return null;
}
