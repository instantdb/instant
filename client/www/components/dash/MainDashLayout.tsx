import { useDashFetch } from '@/lib/hooks/useDashFetch';
import Head from 'next/head';
import { ReactNode, useEffect, useState } from 'react';
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
import { InstantApp } from '@/lib/types';
import { useReadyRouter } from '../clientOnlyPage';
import { useDarkMode } from './DarkModeToggle';
import { Toaster } from '@instantdb/components';
import { useRouter } from 'next/router';

export type FetchedDash = ReturnType<typeof useFetchedDash>;

const WORKSPACE_STORAGE_KEY = 'workspace';

const getSavedWorkspace = () =>
  typeof window === 'undefined'
    ? null
    : window.localStorage.getItem(WORKSPACE_STORAGE_KEY);

const saveWorkspace = (workspaceId: string) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  }
};

export const { use: useFetchedDash, provider: DashFetchProvider } =
  createInitializedContext(
    'dashResponse',
    (args?: { workspaceId?: string | null | undefined }) => {
      const dashResult = useDashFetch();
      const router = useReadyRouter();

      // Read once: the workspace we were in last time, used to reopen a bare
      // /dash where you left off. An explicit switch clears it so a restored
      // default never overrides a deliberate choice.
      const [restoredWorkspace, setRestoredWorkspace] =
        useState(getSavedWorkspace);

      // The URL is the source of truth. With no `org` we reopen the workspace
      // you were last in (a bare entry); an `app` in the URL resolves its own
      // workspace (see pages/dash), so we skip the restore then. The devtool
      // seeds the workspace via `args`.
      const getWorkspaceId = (): string => {
        if (router.query.org) return router.query.org as string;
        if (args?.workspaceId) return args.workspaceId;
        if (restoredWorkspace && !router.query.app) return restoredWorkspace;
        return 'personal';
      };
      const currentWorkspaceId = getWorkspaceId();

      const setWorkspace = (
        workspaceId: string | 'personal',
        opts?: { replace?: boolean },
      ) => {
        setRestoredWorkspace(null);
        const query = workspaceId === 'personal' ? {} : { org: workspaceId };
        if (opts?.replace) {
          router.replace({ query });
        } else {
          router.push({ query });
        }
      };

      const workspace = useWorkspace(dashResult, currentWorkspaceId);

      const refetch = async () => {
        await dashResult.mutate();
        await workspace.mutate();
      };

      // Remember the current workspace so the next bare /dash can restore it.
      useEffect(() => {
        saveWorkspace(currentWorkspaceId);
      }, [currentWorkspaceId]);

      // If we can't load the org (e.g. we were removed from it) fall back to
      // the personal account.
      useEffect(() => {
        if (workspace.error) {
          setWorkspace('personal', { replace: true });
        }
      }, [workspace.error]);

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
          <TopBar />
          <div
            className={`flex w-full grow flex-col overflow-hidden dark:bg-neutral-900 dark:text-white ${className}`}
          >
            {children}
          </div>
        </div>
      </DashFetchProvider>
      <CLILoginDialog tickets={tickets} />
    </TokenContext.Provider>
  );
};
