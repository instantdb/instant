import { useDashFetch } from '@/lib/hooks/useDashFetch';
import Head from 'next/head';
import NextLink from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn, FullscreenLoading } from '../ui';
import { FullscreenErrorMessage } from '@/pages/dash';
import { useAuthToken } from '@/lib/auth';
import Auth from './Auth';
import { TokenContext } from '@/lib/contexts';
import { CLILoginDialog } from './CLILoginDialog';
import { useTicketSystem } from '@/lib/hooks/useTicketSystem';
import { createInitializedContext } from '@/lib/createInitializedContext';
import { TopBar } from './TopBar';
import { useWorkspace } from '@/lib/hooks/useWorkspace';
import { InstantApp, SunsetStage } from '@/lib/types';
import { useReadyRouter } from '../clientOnlyPage';
import { useDarkMode } from './DarkModeToggle';
import { Toaster } from '@instantdb/components';
import { useRouter } from 'next/router';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { isSelfHosted } from '@/lib/config';
import { isFullSunsetStage } from '@/lib/sunset';

export type FetchedDash = ReturnType<typeof useFetchedDash>;

const getInitialWorkspace = () => {
  // pull from the "org" query param
  const org = new URLSearchParams(window.location.search).get('org');

  if (org) return org;
  if (!window) return 'personal';

  const possibleSaved = window.localStorage.getItem('workspace');

  if (possibleSaved) return possibleSaved;
  return 'personal';
};

export const { use: useFetchedDash, provider: DashFetchProvider } =
  createInitializedContext(
    'dashResponse',
    (args?: { workspaceId?: string | null | undefined }) => {
      const dashResult = useDashFetch();
      const [currentWorkspaceId, setWorkspace] = useState<string | 'personal'>(
        args?.workspaceId || getInitialWorkspace(),
      );

      const workspace = useWorkspace(dashResult, currentWorkspaceId);

      const refetch = async () => {
        await dashResult.mutate();
        await workspace.mutate();
      };

      const router = useReadyRouter();

      useEffect(() => {
        if (workspace.error) {
          setWorkspace('personal');
        }
      }, [workspace.error]);

      useEffect(() => {
        if (typeof window === 'undefined') return;

        window.localStorage.setItem('workspace', currentWorkspaceId);

        // Use Next.js router for navigation instead of direct history manipulation
        const currentUrl = new URL(window.location.href);

        // set the query param
        // if its personal remove the query param
        if (currentWorkspaceId === 'personal') {
          if (currentUrl.searchParams.has('org')) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('org');
            router.replace(newUrl.pathname + newUrl.search, undefined, {
              shallow: true,
            });
          }
        } else {
          if (currentUrl.searchParams.get('org') !== currentWorkspaceId) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('org', currentWorkspaceId);
            router.replace(newUrl.pathname + newUrl.search, undefined, {
              shallow: true,
            });
          }
        }
      }, [currentWorkspaceId, router.pathname]);

      const addNewAppOptimistically = (
        promise: Promise<any>,
        app: InstantApp,
      ) => {
        if (currentWorkspaceId === 'personal') {
          dashResult.optimisticUpdate(promise, (draft) => ({
            ...draft,
            apps: [...draft.apps, app],
          }));
        } else {
          workspace.optimisticUpdate(promise, (draft) => ({
            ...draft,
            apps: [...draft.apps, app],
          }));
        }
      };

      return {
        ready: !!dashResult.data && !!workspace.data,
        refetch,
        addNewAppOptimistically,
        setWorkspace,
        data: {
          ...dashResult.data!,
          currentWorkspaceId,
          workspace: workspace.data!,
          apps: workspace.data ? workspace.data.apps : [],
        },
        error: dashResult.error,
        mutate: dashResult.mutate,
        optimisticUpdate: dashResult.optimisticUpdate,
        optimisticUpdateWorkspace: workspace.optimisticUpdate,
        fromCache: dashResult.fromCache,
      };
    },
  );

const announcementNotice = {
  key: 'announced',
  title: 'Instant is sunsetting.',
  body: 'Services will continue until August 31st, 2027.',
  dismissible: true,
};

// The announcement shows even before the sunset-stage flag flips, to
// match the marketing and docs banners which are hardcoded.
const sunsetNotices: Record<
  SunsetStage,
  { key: string; title: string; body: string; dismissible: boolean }
> = {
  none: announcementNotice,
  'signups-closed': announcementNotice,
  'read-only': {
    key: 'read-only',
    title: 'Instant Cloud is now read-only.',
    body: 'You can still download backups of your apps.',
    dismissible: false,
  },
  disabled: {
    key: 'disabled',
    title: 'Instant Cloud is now offline.',
    body: 'You can still download backups of your apps.',
    dismissible: false,
  },
};

// Announces the sunset at the top of the dashboard. Each notice gets its
// own dismissal key so an escalation reappears even if an earlier notice
// was dismissed.
const SunsetNotice = () => {
  const dash = useFetchedDash();
  const stage = dash.data.sunset?.stage ?? 'none';
  const notice = sunsetNotices[stage];
  const [dismissed, setDismissed] = useLocalStorage(
    `sunset-notice-dismissed:${notice.key}`,
    false,
  );

  if (notice.dismissible && dismissed) return null;

  return (
    <div className="flex items-center gap-2 border-b border-orange-200 bg-orange-50 py-2 pr-2 pl-4 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950 dark:text-orange-200">
      <p className="grow text-center">
        <span className="font-semibold">{notice.title}</span> {notice.body}{' '}
        <NextLink
          href="/essays/instant_team_joins_openai"
          className="whitespace-nowrap underline underline-offset-2"
        >
          Read the announcement
        </NextLink>
      </p>
      {notice.dismissible && (
        <button
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-orange-100 dark:hover:bg-orange-900"
          onClick={() => setDismissed(true)}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

// Full sunset mode keeps the dashboard available only as a way to download
// app backups. Enforce that from the shared layout so direct links to any
// dashboard screen end up on the backups page too.
const FullSunsetRedirect = ({ children }: { children: ReactNode }) => {
  const dash = useFetchedDash();
  const router = useRouter();
  const fullSunset = isFullSunsetStage(dash.data.sunset?.stage);
  const requestedAppId =
    typeof router.query.app === 'string' ? router.query.app : undefined;
  const appId =
    dash.data.apps.find((app) => app.id === requestedAppId)?.id ??
    dash.data.apps[0]?.id;
  const org =
    dash.data.currentWorkspaceId === 'personal'
      ? undefined
      : dash.data.currentWorkspaceId;
  const isBackupsRoute =
    router.pathname === '/dash' &&
    router.query.s === 'main' &&
    router.query.app === appId &&
    router.query.t === 'backups';

  useEffect(() => {
    if (!router.isReady || !fullSunset || !appId || isBackupsRoute) return;

    router.replace({
      pathname: '/dash',
      query: {
        s: 'main',
        app: appId,
        t: 'backups',
        ...(org ? { org } : {}),
      },
    });
  }, [appId, fullSunset, isBackupsRoute, org, router.isReady]);

  if (fullSunset && appId && !isBackupsRoute) {
    return <FullscreenLoading />;
  }

  return children;
};

export const MainDashLayout: React.FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const token = useAuthToken();
  const router = useRouter();

  const tickets = useTicketSystem();
  const { darkMode } = useDarkMode();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const handleVerified = () => {
    const returnTo = router.query['return-to'];
    if (
      returnTo &&
      typeof returnTo === 'string' &&
      // Prevent an open redirect
      returnTo.startsWith('/') &&
      !returnTo.startsWith('//')
    ) {
      router.replace(returnTo);
    }
  };

  if (!token) {
    return (
      <Auth
        key="anonymous"
        ticket={tickets.cliNormalTicket}
        onVerified={handleVerified}
      />
    );
  }

  return (
    <TokenContext.Provider value={token}>
      <Head>
        <style global>{
          /* css */ `
            html {
              overscroll-behavior-y: none
            }
          `
        }</style>
      </Head>
      <Toaster position="top-right" theme={darkMode ? 'dark' : 'light'} />
      <DashFetchProvider
        loading={<FullscreenLoading />}
        error={(error) => (
          <FullscreenErrorMessage
            message={`An error occurred. ${error.message}`}
          />
        )}
      >
        <div
          className={cn('fixed inset-0 flex flex-col', darkMode ? 'dark' : '')}
        >
          {!isSelfHosted && <SunsetNotice />}
          <TopBar />
          <div
            className={`flex w-full grow flex-col overflow-hidden dark:bg-neutral-900 dark:text-white ${className}`}
          >
            <FullSunsetRedirect>{children}</FullSunsetRedirect>
          </div>
        </div>
      </DashFetchProvider>
      <CLILoginDialog tickets={tickets} />
    </TokenContext.Provider>
  );
};
