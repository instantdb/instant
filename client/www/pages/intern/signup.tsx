import Head from 'next/head';
import React from 'react';
import AdminRoot from '../../components/admin/AdminRoot';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';

const AdminIndex = () => {
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;
  return (
    <div className="h-screen w-screen">
      <Head>
        <title>Instant Dashboard</title>
      </Head>
      <AdminRoot />
    </div>
  );
};

export default AdminIndex;
