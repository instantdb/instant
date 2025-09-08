import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  TextLink,
} from '@/components/marketingUi';
import * as og from '@/lib/og';
import styles from '@/styles/status.module.css';
import type { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import type { UptimeResponse, Monitor } from '@/lib/uptimeAPI';
import * as uptimeAPI from '@/lib/uptimeAPI';

export const getServerSideProps = (async (ctx) => {
  // This is considered `fresh` for 10 the next 10 seconds.
  //
  // If a request is repeated within the next 10 seconds:
  //   the previously cached value will still be fresh.
  // If the request is repeated before 59 seconds,
  //   the cached value will be stale but still render
  //   (stale-while-revalidate=59).
  //
  //   ...but in the background, a revalidation request will
  //   be made to populate the cache with a fresh value.
  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=10, stale-while-revalidate=59',
  );

  const uptime = await uptimeAPI.fetchUptime();
  return {
    props: {
      uptime,
    },
  };
}) satisfies GetServerSideProps<{ uptime: UptimeResponse }>;

const ERR_COLOR = '#e5e7eb';
const PERFECT_COLOR = '#22c55e';
const GOOD_COLOR = '#86efac';
const BAD_COLOR = '#fbbf24';
const WORST_COLOR = '#fb923c';
const DIVIDER_COLOR = '#e5e7eb';

function getUptimeColor(percentage: number) {
  if (percentage >= 100) {
    return PERFECT_COLOR;
  }

  if (percentage >= 99.9) {
    return GOOD_COLOR;
  }

  if (percentage >= 99) {
    return BAD_COLOR;
  }

  return WORST_COLOR;
}

function MainStatus({
  allOperational,
  lastUpdated,
}: {
  allOperational: boolean;
  lastUpdated: Date;
}) {
  return (
    <div className="flex justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 z-10 py-4 md:py-8 relative">
      <div className="relative bg-white w-full max-w-4xl h-32 sm:h-44 md:h-60 border-2 border-gray-200">
        <div className="absolute top-3 right-4 text-xs md:text-sm font-mono">
          <div className="text-right">
            <span className="text-gray-500">
              Last updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        </div>
        <div className="flex gap-4 sm:gap-6 md:gap-8 h-full justify-center items-center px-4">
          <div
            className={`flex justify-center items-center ${allOperational ? '' : 'w-5 h-5 sm:h-7 sm:w-7'} h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-2xl flex-shrink-0`}
            style={{
              backgroundColor: allOperational ? GOOD_COLOR : ERR_COLOR,
            }}
          >
            <div
              className={`h-8 w-8 sm:h-10 sm:w-10 absolute rounded-full shadow-2xl ${styles.pulseAnimation}`}
              style={{
                backgroundColor: allOperational ? GOOD_COLOR : ERR_COLOR,
              }}
            ></div>
          </div>

          <span className="font-mono text-lg sm:text-xl md:text-2xl">
            {allOperational
              ? 'All systems Operational'
              : 'Failed to receive status information'}
          </span>
        </div>
      </div>
    </div>
  );
}

function MonitorDisplay({
  monitor,
  title,
}: {
  monitor: Monitor | undefined;
  title: string;
}) {
  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm md:text-base font-semibold">{title}</span>
          <span className="text-xs md:text-sm text-gray-500">|</span>
          <span
            className={`text-sm md:text-base font-semibold ${monitor?.uptime_ratio?.['90d'] ? 'text-green-500' : 'text-gray-400'}`}
          >
            {monitor?.uptime_ratio?.['90d']
              ? `${monitor.uptime_ratio['90d'].toFixed(3)}%`
              : '...'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <div
            className="relative w-2 h-2 rounded-full flex justify-center items-center"
            style={{
              backgroundColor: monitor?.status === 2 ? GOOD_COLOR : WORST_COLOR,
            }}
          >
            <div
              className={`absolute w-2 h-2 rounded-full ${styles.pulseAnimation}`}
              style={{
                backgroundColor:
                  monitor?.status === 2 ? GOOD_COLOR : WORST_COLOR,
              }}
            ></div>
          </div>
          <span className="text-xs md:text-sm text-gray-600">
            {monitor?.status === 2 ? 'Operational' : 'Issues Detected'}
          </span>
        </div>
      </div>
      <div className="flex h-10 gap-px">
        {(monitor?.daily_uptime || Array(90).fill(null)).map(
          (percentage: number | null, index: number) => {
            const date = new Date();
            date.setDate(date.getDate() - (89 - index));
            const dateStr = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={index}
                className="flex-1 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor:
                    percentage !== null
                      ? getUptimeColor(percentage)
                      : ERR_COLOR,
                }}
                title={`${dateStr}: ${percentage !== null ? `${percentage.toFixed(3)}% uptime` : 'Loading...'}`}
              ></div>
            );
          },
        )}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-xs text-gray-500">90 days ago</span>
        <span className="text-xs text-gray-500">Today</span>
      </div>
    </>
  );
}

function UptimeDetails({ uptime }: { uptime: UptimeResponse }) {
  const backendMonitor = uptime.monitors.find(
    (m: Monitor) =>
      m.friendly_name?.toLowerCase().includes('backend') ||
      m.friendly_name?.toLowerCase().includes('api'),
  );
  const walMonitor = uptime.monitors?.find(
    (m: Monitor) =>
      m.friendly_name?.toLowerCase().includes('wal') ||
      m.friendly_name?.toLowerCase().includes('write'),
  );

  return (
    <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
      <div className="font-mono flex-1 max-w-4xl">
        <span className="text-sm md:text-base font-semibold">
          Uptime last 90 days
        </span>
        <div className="shadow-sm bg-white border-gray-200 border-2 p-3 md:p-4 mt-2">
          <MonitorDisplay monitor={backendMonitor} title="Instant API" />
          <div className="flex py-6">
            <div
              className="h-0.5 w-full"
              style={{ backgroundColor: DIVIDER_COLOR }}
            ></div>
          </div>
          <MonitorDisplay monitor={walMonitor} title="Instant Reactivity" />
        </div>
      </div>
    </div>
  );
}

function OverallUptime({ uptime }: { uptime: UptimeResponse }) {
  return (
    <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
      <div className="font-mono flex-1 max-w-4xl">
        <span className="text-sm md:text-base font-semibold">
          Overall Uptime
        </span>
        <div className="flex shadow-sm bg-white border-gray-200 border-2 p-4 sm:p-6 mt-2 h-auto sm:h-48 md:h-64 justify-center items-center">
          <div className="flex items-center flex-col sm:flex-row gap-6 sm:gap-2.5 py-4 sm:py-0">
            <div className="flex flex-col flex-1 sm:w-40 text-center">
              <span className="text-2xl font-semibold">
                {uptime?.overall_uptime?.['24h']?.toFixed(3) || '...'}%
              </span>
              <span className="text-sm text-gray-500">Last 24 Hours</span>
            </div>
            <div
              className="w-60 h-0.5 sm:w-0.5 sm:h-20"
              style={{ backgroundColor: DIVIDER_COLOR }}
            ></div>
            <div className="flex flex-col flex-1 sm:w-40 text-center">
              <span className="text-2xl font-semibold">
                {uptime?.overall_uptime?.['7d']?.toFixed(3) || '...'}%
              </span>
              <span className="text-sm text-gray-500">Last 7 Days</span>
            </div>
            <div
              className="w-60 h-0.5 sm:w-0.5 sm:h-20"
              style={{ backgroundColor: DIVIDER_COLOR }}
            ></div>
            <div className="flex flex-col flex-1 sm:w-40 text-center">
              <span className="text-2xl font-semibold">
                {uptime?.overall_uptime?.['30d']?.toFixed(3) || '...'}%
              </span>
              <span className="text-sm text-gray-500">Last 30 Days</span>
            </div>
            <div
              className="w-60 h-0.5 sm:w-0.5 sm:h-20"
              style={{ backgroundColor: DIVIDER_COLOR }}
            ></div>
            <div className="flex flex-col flex-1 sm:w-40 text-center">
              <span className="text-2xl font-semibold">
                {uptime?.overall_uptime?.['90d']?.toFixed(3) || '...'}%
              </span>
              <span className="text-sm text-gray-500">Last 90 Days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportSection() {
  return (
    <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
      <div className="flex-1 max-w-4xl space-y-4 mb-4">
        <h3 className="font-mono text-sm md:text-base font-semibold text-center">
          Experiencing issues?
        </h3>

        <p className="text-sm md:text-base text-center">
          Reach out to us on{' '}
          <TextLink
            href="https://discord.com/invite/VU53p7uQcE"
            target="_blank"
          >
            Discord
          </TextLink>{' '}
          or send us an{' '}
          <TextLink href="mailto:hello@instantdb.com" target="_blank">
            email
          </TextLink>
          . We'll get right on it!
        </p>
      </div>
    </div>
  );
}

function StatusPage({ uptime }: { uptime: UptimeResponse }) {
  const allOperational =
    uptime.monitors.length > 0 &&
    uptime.monitors.every((m: Monitor) => m.status === 2);

  return (
    <div className="flex flex-col relative min-h-screen overflow-y-auto">
      <MainStatus
        allOperational={allOperational}
        lastUpdated={new Date(uptime.last_updated)}
      />
      <UptimeDetails uptime={uptime} />
      <OverallUptime uptime={uptime} />
      <SupportSection />
    </div>
  );
}

export default function Page({
  uptime,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <LandingContainer>
      <Head>
        <title>Instant Status</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ section: 'status' })}
        />
      </Head>
      <div className="flex min-h-screen justify-between flex-col">
        <div>
          <MainNav />
        </div>
        <StatusPage uptime={uptime} />
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
