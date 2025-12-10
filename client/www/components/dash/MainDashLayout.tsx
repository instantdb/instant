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
import { StyledToastContainer } from '@/lib/toast';
import { TopBar } from './TopBar';
import { useWorkspace } from '@/lib/hooks/useWorkspace';
import { InstantApp } from '@/lib/types';
import { useReadyRouter } from '../clientOnlyPage';
import { useDarkMode } from './DarkModeToggle';

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

export const MainDashLayout: React.FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const token = useAuthToken();

  const tickets = useTicketSystem();
  const { darkMode } = useDarkMode();

  useEffect(() => {
    if (darkMode && token) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [darkMode]);

  if (!token) {
    return (
      <Auth
        key="anonymous"
        ticket={tickets.cliNormalTicket}
        onVerified={({ ticket }) => {
          tickets.setLoginTicket(ticket);
        }}
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
      <StyledToastContainer theme={darkMode ? 'dark' : 'light'} />
      <DashFetchProvider
        loading={<FullscreenLoading />}
        error={(error) => (
          <FullscreenErrorMessage
            message={`An error occurred. ${error.message}`}
          />
        )}
      >
        <div
          className={cn(
            'flex min-h-full w-full flex-col md:max-h-screen',
            darkMode ? 'dark' : '',
          )}
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
