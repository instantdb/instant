import { useContext, useEffect, useState } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import {
  Content,
  SectionHeading,
  Select,
  SubsectionHeading,
} from '@/components/ui';
import { InstantApp } from '@/lib/types';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  DashPage,
  DashPanel,
  DashPanelHeader,
  DashShell,
  toDirectoryName,
  useFetchedDash,
} from '../_shared';

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
    <DashPanel>
      <DashPanelHeader title="Live sessions" />
      <div className="space-y-2">
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
          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-neutral-800">
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
    </DashPanel>
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
      className="block cursor-pointer justify-start rounded-md border border-gray-200 bg-white p-4 shadow-xs transition-colors hover:border-gray-300 hover:bg-[#fbfaf8] dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div>
        <div className="font-semibold text-gray-950 dark:text-white">
          {title}
        </div>
        <div className="text-sm text-gray-500 dark:text-neutral-400">
          {description}
        </div>
      </div>
    </a>
  );
}

function CommandSnippet({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex min-w-0 items-center overflow-hidden rounded-md border border-gray-200 bg-gray-950 text-sm text-gray-100 shadow-xs dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-white/10 font-mono text-gray-500">
        $
      </div>
      <code className="min-w-0 flex-1 overflow-x-auto px-3 font-mono text-[13px] whitespace-nowrap">
        {value}
      </code>
      <button
        type="button"
        className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        title="Copy command"
        onClick={() => {
          window.navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <ClipboardDocumentIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function HomeBody({ app }: { app: InstantApp }) {
  const [framework, setFramework] = useState<Framework>('nextjs');
  const dirName = toDirectoryName(app.title);
  const steps = getHomeSteps(framework, dirName, app.id, app.admin_token);

  return (
    <DashPage size="wide">
      <div>
        <SectionHeading>Home</SectionHeading>
        <Content className="mt-1">
          Start a new app with the credentials already wired in.
        </Content>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_340px]">
        <DashPanel className="min-w-0">
          <DashPanelHeader
            title="Getting started"
            description="Choose a target and run the commands in order."
            action={
              <Select
                value={framework}
                options={[
                  { label: 'Web app', value: 'nextjs' },
                  { label: 'Mobile app', value: 'expo' },
                ]}
                onChange={(option) =>
                  option && setFramework(option.value as Framework)
                }
              />
            }
          />

          <div>
            {steps.map((step, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-[#fbfaf8] text-sm font-semibold text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="h-full w-px bg-gray-200 dark:bg-neutral-800" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <SubsectionHeading>{step.title}</SubsectionHeading>
                  <Content>
                    <p className="mt-1 text-sm">{step.description}</p>
                  </Content>
                  {step.command && (
                    <div className="mt-3 mb-4">
                      <CommandSnippet value={step.command} />
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

          <div className="mt-1 rounded-md border border-gray-200 bg-[#fbfaf8] p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <SubsectionHeading>Verify the connection</SubsectionHeading>
            <Content>
              <p className="mt-1 text-sm">
                Once your app connects, the live session count updates in the
                app health panel. Then use Explorer or Sandbox to inspect data.
              </p>
            </Content>
          </div>
        </DashPanel>

        <div className="flex min-w-0 flex-col gap-4">
          <AppStatsSection app={app} />

          <DashPanel>
            <DashPanelHeader
              title="Next steps"
              description="Helpful links once the app is running."
            />
            <div className="grid gap-2">
              <HomeCard
                href="/docs"
                title="Read the docs"
                description="Start learning how to use Instant."
              />
              <HomeCard
                href="https://discord.com/invite/VU53p7uQcE"
                title="Join the community"
                description="Meet other builders and share feedback."
              />
            </div>
          </DashPanel>
        </div>
      </div>
    </DashPage>
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
