import { useContext, useEffect, useState } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import {
  Button,
  Content,
  Copyable,
  ScreenHeading,
  SectionHeading,
  Select,
  SubsectionHeading,
} from '@/components/ui';
import { InstantApp } from '@/lib/types';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import AnimatedCounter from '@/components/AnimatedCounter';
import { DashShell, toDirectoryName, useFetchedDash } from '../_shared';

type AppStatsResponse = {
  count: number;
  origins: Record<string, number>;
};

function fetchAppStats(
  token: string,
  appId: string,
): Promise<AppStatsResponse> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/stats`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function useAppConnectionStats(token: string, appId: string) {
  const [stats, setStats] = useState<AppStatsResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!token || !appId) return;
    let cancel = false;
    const tick = async () => {
      try {
        const data = await fetchAppStats(token, appId);
        if (cancel) return;
        setStats(data);
        setError(null);
      } catch (err) {
        if (cancel) return;
        setStats(null);
        setError(err as Error);
      }
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, [token, appId]);

  const isLoading = stats === null && error === null;
  return { stats, isLoading, error };
}

function AppStatsSection({ app }: { app: InstantApp }) {
  const token = useContext(TokenContext)!;
  const { stats, isLoading, error } = useAppConnectionStats(token, app.id);
  const sortedOrigins = stats?.origins
    ? Object.entries(stats.origins).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="mt-10">
      <SectionHeading>Your App Statistics</SectionHeading>
      <div className="mt-4 space-y-2 rounded-sm border bg-white p-4 shadow-xs transition-colors dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex items-center justify-between">
          <div className="mt-1">
            {isLoading ? (
              <div>Loading...</div>
            ) : error ? (
              <div>Error: {error.message}</div>
            ) : (
              <div className="inline-flex items-center space-x-2">
                <AnimatedCounter number={stats?.count || 0} height={38} />
                <div className="flex-1">sessions are connected right now</div>
              </div>
            )}
          </div>
        </div>

        {!isLoading && !error && sortedOrigins.length > 0 && (
          <div className="mt-4 border-gray-200 pt-4 dark:border-neutral-600">
            <div className="mb-2 text-sm font-medium text-gray-500 dark:text-neutral-400">
              Per Origin
            </div>
            <div className="space-y-2">
              {sortedOrigins.map(([origin, count]) => {
                const isLocalhost = origin.includes('localhost');
                return (
                  <div
                    key={origin}
                    className="flex items-center justify-between"
                  >
                    <div className="flex-1 truncate">
                      {isLocalhost ? (
                        <span className="text-sm text-gray-700 dark:text-neutral-300">
                          {origin}
                        </span>
                      ) : (
                        <a
                          href={origin}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {origin}
                        </a>
                      )}
                    </div>
                    <div className="ml-2 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-neutral-700 dark:text-neutral-300">
                      {count.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type Framework = 'nextjs' | 'expo';

function getHomeSteps(
  framework: Framework,
  dirName: string,
  appId: string,
  adminToken: string,
) {
  const isNext = framework === 'nextjs';
  const flag = isNext ? '--next' : '--expo';
  const devCommand = isNext ? 'npm run dev' : 'npx expo start';
  const viewStep = isNext
    ? {
        title: 'View your app',
        description: 'Open your browser to see the app running locally',
        link: 'http://localhost:3000',
      }
    : {
        title: 'View your app',
        description:
          'Scan the QR code in your terminal to open the app in Expo Go',
      };
  return [
    {
      title: 'Create your project',
      description: `Scaffold a new ${
        isNext ? 'Next.js' : 'Expo'
      } app with Instant pre-configured`,
      command: `npx create-instant-app ${dirName} --app ${appId} --token ${adminToken} ${flag} --rules`,
    },
    {
      title: 'Start the dev server',
      description: 'Navigate to your project and run the development server',
      command: `cd ${dirName} && ${devCommand}`,
    },
    viewStep as {
      title: string;
      description: string;
      command?: string;
      link?: string;
    },
  ];
}

function HomeCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="block cursor-pointer justify-start space-y-2 rounded-sm border bg-white p-4 shadow-xs transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700/50"
    >
      <div>
        <div className="font-bold">{title}</div>
        <div className="text-sm text-gray-500 dark:text-neutral-400">
          {description}
        </div>
      </div>
    </a>
  );
}

function HomeBody({ app }: { app: InstantApp }) {
  const [framework, setFramework] = useState<Framework>('nextjs');
  const [hideAppId, setHideAppId] = useState(false);
  const dirName = toDirectoryName(app.title);
  const steps = getHomeSteps(framework, dirName, app.id, app.admin_token);

  return (
    <div className="max-w-2xl p-4 text-sm md:text-base">
      <div className="pb-10">
        <SectionHeading>Getting Started</SectionHeading>
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <span>Run these commands to create a new</span>
          <Select
            value={framework}
            options={[
              { label: 'web app', value: 'nextjs' },
              { label: 'mobile app', value: 'expo' },
            ]}
            onChange={(option) =>
              option && setFramework(option.value as Framework)
            }
          />
          <span>with your credentials.</span>
        </div>

        <div className="mt-6">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-neutral-400/20 bg-gray-200 text-sm font-medium text-gray-700 dark:bg-neutral-700 dark:text-neutral-300">
                  {index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div className="h-full w-px bg-gray-200 dark:bg-neutral-700" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-2">
                <SubsectionHeading>{step.title}</SubsectionHeading>
                <Content>
                  <p className="mt-1 text-sm">{step.description}</p>
                </Content>
                {step.command && (
                  <div className="mt-3 mb-4">
                    <Copyable value={step.command} label="$" />
                  </div>
                )}
                {step.link && (
                  <div className="mt-3 mb-4">
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {step.link}
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t pt-6 dark:border-neutral-700">
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-green-600/30 bg-green-100 text-sm dark:bg-green-900/30">
                <span className="text-green-600 dark:text-green-400">✓</span>
              </div>
            </div>
            <div className="flex-1">
              <SubsectionHeading>Got it working?</SubsectionHeading>
              <Content>
                <p className="mt-1 text-sm">Give yourself a pat on the back!</p>
              </Content>
              <Button variant="secondary" className="mt-3" size="normal">
                Heck yeah!
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SectionHeading>Next Steps</SectionHeading>
      <div className="pt-1">
        Now that you have your app running, here's some helpful links on what to
        do next!
      </div>

      <div className="flex flex-col gap-4 pt-4 md:flex-row md:flex-wrap md:justify-center">
        <div className="md:w-[calc(50%-0.5rem)]">
          <HomeCard
            href="/docs"
            title="Read the Docs"
            description="Jump into our docs to start learning how to use Instant."
          />
        </div>
        <div className="md:w-[calc(50%-0.5rem)]">
          <HomeCard
            href="https://discord.com/invite/VU53p7uQcE"
            title="Join the community"
            description="Join our Discord to meet like-minded hackers, and to give us feedback too!"
          />
        </div>
      </div>

      <div className="mt-10">
        <SectionHeading>Your Public App ID</SectionHeading>
        <div className="pt-1">
          Use this App ID to connect to your database{' '}
          <a
            className="underline hover:cursor-pointer dark:text-white"
            href="/docs/init"
            target="_blank"
          >
            via init
          </a>
          . This ID is safe to use in public-facing applications.
        </div>
        <div className="mt-4">
          <Copyable
            value={app.id}
            size="large"
            hideValue={hideAppId}
            onChangeHideValue={() => setHideAppId(!hideAppId)}
          />
        </div>
      </div>

      <AppStatsSection app={app} />
    </div>
  );
}

export function Current() {
  const dashResponse = useFetchedDash();
  const app = dashResponse.data.apps[0];

  if (!app) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-center">
        <div className="max-w-sm">
          <p className="mb-4 text-sm text-gray-700 dark:text-neutral-300">
            You don't have any apps yet. Create one on the real dashboard, then
            come back.
          </p>
          <a
            href="/dash"
            className="text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
          >
            Go to /dash
          </a>
        </div>
      </div>
    );
  }

  return (
    <DashShell active="home" app={app}>
      <HomeBody app={app} />
    </DashShell>
  );
}
