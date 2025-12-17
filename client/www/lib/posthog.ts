import posthog from 'posthog-js';

// Initialize at module load so PostHog is ready before any React effects run
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: '/a',
    ui_host: 'https://us.posthog.com',
    defaults: '2025-11-30',
    capture_exceptions: true,
    debug:
      process.env.NODE_ENV === 'development' &&
      !!process.env.NEXT_PUBLIC_POSTHOG_DEBUG,
  });
}

export default posthog;
