import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { NextRouter, useRouter } from 'next/router';

export function useReadyRouter(): Omit<NextRouter, 'isReady'> {
  const router = useRouter();
  if (!router.isReady) {
    throw new Error(
      'Router was not ready. Make sure to call this hook somewhere inside an `asClientOnlyPage` component',
    );
  }
  return router;
}

export function asClientOnlyPage<Props extends JSX.IntrinsicAttributes>(
  Component: React.ComponentType<Props>,
) {
  return function ClientOnlyPage(props: Props) {
    const isHydrated = useIsHydrated();
    const router = useRouter();
    if (!isHydrated) {
      return null;
    }
    if (!router.isReady) {
      return null;
    }

    return <Component {...props} />;
  };
}
