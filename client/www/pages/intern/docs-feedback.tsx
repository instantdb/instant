'use client';

import { AuthGate } from '@/components/intern/docs-feedback/auth';
import { AnalyticsDashboard } from '@/components/intern/docs-feedback/analytics-dashboard';

// Because this is a separate Instant app with it's own permissons we need
// to log in to have adequate access to the data.
export default function Home() {
  return (
    <AuthGate>
      <AnalyticsDashboard />
    </AuthGate>
  );
}
