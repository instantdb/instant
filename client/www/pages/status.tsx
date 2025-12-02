// This is not in use, we now redirect to `https://status.instantdb.com`
// We had to switch because the uptimerobot API has become unstable and
// frequently times out in our 15 second function deadline.

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
    <div className="relative z-10 flex justify-center px-4 py-4 sm:px-8 md:px-16 md:py-8 lg:px-32 xl:px-64">
      <div className="relative h-32 w-full max-w-4xl border-2 border-gray-200 bg-white sm:h-44 md:h-60">
        <div className="absolute top-3 right-4 font-mono text-xs md:text-sm">
          <div className="text-right">
            <span className="text-gray-500">
              Last updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        </div>
        <div className="flex h-full items-center justify-center gap-4 px-4 sm:gap-6 md:gap-8">
          <div
            className={`flex items-center justify-center ${allOperational ? '' : 'h-5 w-5 sm:h-7 sm:w-7'} h-10 w-10 shrink-0 rounded-full shadow-2xl sm:h-12 sm:w-12`}
            style={{
              backgroundColor: allOperational ? GOOD_COLOR : ERR_COLOR,
            }}
          >
            <div
              className={`absolute h-8 w-8 rounded-full shadow-2xl sm:h-10 sm:w-10 ${styles.pulseAnimation}`}
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
      <div className="mb-3 flex flex-col items-start justify-between sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold md:text-base">{title}</span>
          <span className="text-xs text-gray-500 md:text-sm">|</span>
          <span
            className={`text-sm font-semibold md:text-base ${monitor?.uptime_ratio?.['90d'] ? 'text-green-500' : 'text-gray-400'}`}
          >
            {monitor?.uptime_ratio?.['90d']
              ? `${monitor.uptime_ratio['90d'].toFixed(3)}%`
              : '...'}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 sm:mt-0">
          <div
            className="relative flex h-2 w-2 items-center justify-center rounded-full"
            style={{
              backgroundColor: monitor?.status === 2 ? GOOD_COLOR : WORST_COLOR,
            }}
          >
            <div
              className={`absolute h-2 w-2 rounded-full ${styles.pulseAnimation}`}
              style={{
                backgroundColor:
                  monitor?.status === 2 ? GOOD_COLOR : WORST_COLOR,
              }}
            ></div>
          </div>
          <span className="text-xs text-gray-600 md:text-sm">
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
                className="flex-1 cursor-pointer rounded-xs transition-opacity hover:opacity-80"
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
      <div className="mt-2 flex justify-between">
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
    <div className="relative z-10 flex justify-center px-4 py-4 sm:px-8 md:px-16 lg:px-32 xl:px-64">
      <div className="max-w-4xl flex-1 font-mono">
        <span className="text-sm font-semibold md:text-base">
          Uptime last 90 days
        </span>
        <div className="mt-2 border-2 border-gray-200 bg-white p-3 shadow-xs md:p-4">
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
    <div className="relative z-10 flex justify-center px-4 py-4 sm:px-8 md:px-16 lg:px-32 xl:px-64">
      <div className="max-w-4xl flex-1 font-mono">
        <span className="text-sm font-semibold md:text-base">
          Overall Uptime
        </span>
        <div className="mt-2 flex h-auto items-center justify-center border-2 border-gray-200 bg-white p-4 shadow-xs sm:h-48 sm:p-6 md:h-64">
          <div className="flex flex-col items-center gap-6 py-4 sm:flex-row sm:gap-2.5 sm:py-0">
            <div className="flex flex-1 flex-col text-center sm:w-40">
              <span className="text-2xl font-semibold">
                {uptime?.overall_uptime?.['24h']?.toFixed(3) || '...'}%
              </span>
              <span className="text-sm text-gray-500">Last 24 Hours</span>
            </div>
            <div
              className="h-0.5 w-60 sm:h-20 sm:w-0.5"
              style={{ backgroundColor: DIVIDER_COLOR }}
            ></div>
            <div className="flex flex-1 flex-col text-center sm:w-40">
              <span className="text-2xl font-semibold">
                {uptime?.overall_uptime?.['7d']?.toFixed(3) || '...'}%
              </span>
              <span className="text-sm text-gray-500">Last 7 Days</span>
            </div>
            <div
              className="h-0.5 w-60 sm:h-20 sm:w-0.5"
              style={{ backgroundColor: DIVIDER_COLOR }}
            ></div>
            <div className="flex flex-1 flex-col text-center sm:w-40">
              <span className="text-2xl font-semibold">
                {uptime?.overall_uptime?.['30d']?.toFixed(3) || '...'}%
              </span>
              <span className="text-sm text-gray-500">Last 30 Days</span>
            </div>
            <div
              className="h-0.5 w-60 sm:h-20 sm:w-0.5"
              style={{ backgroundColor: DIVIDER_COLOR }}
            ></div>
            <div className="flex flex-1 flex-col text-center sm:w-40">
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
    <div className="relative z-10 flex justify-center px-4 py-4 sm:px-8 md:px-16 lg:px-32 xl:px-64">
      <div className="mb-4 max-w-4xl flex-1 space-y-4">
        <h3 className="text-center font-mono text-sm font-semibold md:text-base">
          Experiencing issues?
        </h3>

        <p className="text-center text-sm md:text-base">
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
    <div className="relative flex min-h-screen flex-col overflow-y-auto">
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
      <div className="flex min-h-screen flex-col justify-between">
        <div>
          <MainNav />
        </div>
        <StatusPage uptime={uptime} />
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
