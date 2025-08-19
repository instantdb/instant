'use client';

import App from '@/lib/intern/llm-example/app/page';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { useAdmin } from '@/lib/auth';

function Page() {
  const { isAdmin, isLoading, error } = useAdmin();
  const isHydrated = useIsHydrated();

  if (!isHydrated || isLoading) {
    return <div></div>;
  }

  if (error || !isAdmin) {
    return <div>You do not have access to this page.</div>;
  }

  return <App />;
}

export default Page;
