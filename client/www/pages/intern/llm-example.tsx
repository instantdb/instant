'use client';

import App from '@/lib/intern/llm-example/app/page';
import { useAdmin } from '@/lib/auth';

function Page() {
  const { isAdmin, isLoading, error } = useAdmin();

  if (isLoading) {
    return null;
  }

  if (error || !isAdmin) {
    return <div>You do not have access to this page.</div>;
  }

  return <App />;
}

export default Page;
