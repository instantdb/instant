import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';
import { useAuthInfo } from '@/lib/auth';

/**
 * Identifies logged-in users in PostHog across all pages.
 * This ensures user activity is tracked even when they visit
 * non-dashboard pages like the homepage or docs.
 */
export function PostHogIdentify() {
  const posthog = usePostHog();
  const { user } = useAuthInfo();
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip if no user or already identified this user
    if (!user || identifiedUserIdRef.current === user.id) return;

    posthog.identify(user.email, {
      user_id: user.id,
      signed_up_at: user.created_at,
    });
    identifiedUserIdRef.current = user.id;
  }, [user, posthog]);

  return null;
}
