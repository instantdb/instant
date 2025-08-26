import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import * as og from '@/lib/og';
import { useState, useEffect } from 'react';
import styles from '@/styles/status.module.css';
import type { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import type { UptimeAPIResponse } from '@/lib/uptimeAPI';
import * as uptimeAPI from '@/lib/uptimeAPI';

export const getServerSideProps = (async () => {
  const initialStats = await uptimeAPI.fetchStats();
  return {
    props: {
      initialStats,
    },
  };
}) satisfies GetServerSideProps<{ initialStats: UptimeAPIResponse }>;

interface Monitor {
  id: string;
  friendly_name: string;
  url: string;
  status: number;
  uptime_ratio: {
    '24h': number;
    '7d': number;
    '30d': number;
    '90d': number;
    all_time: number;
  };
  daily_uptime: number[];
  average_response_time: number;
}

interface UptimeData {
  monitors: Monitor[];
  overall_uptime: {
    '24h': number;
    '7d': number;
    '30d': number;
    '90d': number;
  };
  last_updated: string;
}

interface StatusState {
  data: UptimeData | null;
  isLoading: boolean;
  lastUpdated: Date;
}

const error_color = '#e5e7eb';
const perfect_color = '#22c55e';
const good_color = '#86efac';
const bad_color = '#fbbf24';
const worst_color = '#fb923c';
const divider_color = '#e5e7eb';

function getUptimeColor(percentage: number) {
  if (percentage < 0 || percentage > 100) {
    return error_color;
  }
  if (percentage >= 100) {
    return perfect_color;
  } else if (percentage >= 99.9) {
    return good_color;
  } else if (percentage >= 99) {
    return bad_color;
  } else {
    return worst_color;
  }
}

const processUptimeData = (apiRes: UptimeAPIResponse): UptimeData => {
  const monitors =
    apiRes.monitors?.map((monitor): Monitor => {
      const customRatios = monitor.custom_uptime_ratio?.split('-') || [];
      const customRanges = monitor.custom_uptime_ranges?.split('-') || [];

      const dailyUptime = customRanges.map((range: string) => {
        const uptime = parseFloat(range);
        return isNaN(uptime) ? 100 : uptime;
      });

      while (dailyUptime.length < 90) {
        dailyUptime.push(100);
      }

      return {
        id: monitor.id,
        friendly_name: monitor.friendly_name,
        url: monitor.url,
        status: monitor.status,
        uptime_ratio: {
          '24h': parseFloat(customRatios[0]) || 100,
          '7d': parseFloat(customRatios[1]) || 100,
          '30d': parseFloat(customRatios[2]) || 100,
          '90d': parseFloat(customRatios[3]) || 100,
          all_time: parseFloat(monitor.all_time_uptime_ratio) || 100,
        },
        daily_uptime: dailyUptime,
        average_response_time: monitor.average_response_time,
      };
    }) || [];

  const overallUptime = {
    '24h':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['24h'],
        0,
      ) / (monitors.length || 1),
    '7d':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['7d'],
        0,
      ) / (monitors.length || 1),
    '30d':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['30d'],
        0,
      ) / (monitors.length || 1),
    '90d':
      monitors.reduce(
        (acc: number, m: Monitor) => acc + m.uptime_ratio['90d'],
        0,
      ) / (monitors.length || 1),
  };

  return {
    monitors,
    overall_uptime: overallUptime,
    last_updated: new Date().toISOString(),
  };
};

function MainStatus({
  isLoading,
  allOperational,
  lastUpdated,
  nextUpdate,
}: {
  isLoading: boolean;
  allOperational: boolean;
  lastUpdated: Date;
  nextUpdate: number;
}) {
  return (
    <div className="flex justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 z-10 py-4 md:py-8 relative">
      <div className="relative bg-white w-full max-w-4xl h-32 sm:h-44 md:h-60 border-2 border-gray-200">
        <div className="absolute top-3 right-4 text-xs md:text-sm font-mono">
          <div className="text-right">
            <div className="font-semibold text-gray-700 mb-1">
              Service Status
            </div>
            <span className="text-gray-500">
              Last updated {lastUpdated.toLocaleTimeString()} | Next update in{' '}
              {nextUpdate} sec.
            </span>
          </div>
        </div>
        <div className="flex gap-4 sm:gap-6 md:gap-8 h-full justify-center items-center px-4">
          <div
            className={`flex justify-center items-center ${allOperational ? '' : 'w-5 h-5 sm:h-7 sm:w-7'} h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-2xl flex-shrink-0`}
            style={{
              backgroundColor: allOperational ? good_color : error_color,
            }}
          >
            <div
              className={`h-8 w-8 sm:h-10 sm:w-10 absolute rounded-full shadow-2xl ${styles.pulseAnimation}`}
              style={{
                backgroundColor: allOperational ? good_color : error_color,
              }}
            ></div>
          </div>

          <span className="font-mono text-lg sm:text-xl md:text-2xl">
            {isLoading
              ? 'Loading...'
              : allOperational
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
          <span className="text-sm md:text-base font-medium">{title}</span>
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
              backgroundColor: monitor?.status === 2 ? good_color : worst_color,
            }}
          >
            <div
              className={`absolute w-2 h-2 rounded-full ${styles.pulseAnimation}`}
              style={{
                backgroundColor:
                  monitor?.status === 2 ? good_color : worst_color,
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
                      : error_color,
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

function UptimeDetails({
  backendMonitor,
  walMonitor,
}: {
  backendMonitor: Monitor | undefined;
  walMonitor: Monitor | undefined;
}) {
  return (
    <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
      <div className="font-mono flex-1 max-w-4xl">
        <span className="text-sm md:text-base font-semibold">
          Uptime last 90 days
        </span>
        <div className="shadow-sm bg-white border-gray-200 border-2 p-3 md:p-4 mt-2">
          <MonitorDisplay monitor={backendMonitor} title="Instant backend" />
          <div className="flex py-6">
            <div
              className="h-0.5 w-full"
              style={{ backgroundColor: divider_color }}
            ></div>
          </div>
          <MonitorDisplay monitor={walMonitor} title="Instant WAL" />
        </div>
      </div>
    </div>
  );
}

function OverallUptime({ uptimeData }: { uptimeData: UptimeData | null }) {
  return (
    <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
      <div className="font-mono flex-1 max-w-4xl">
        <span className="text-sm md:text-base font-semibold">
          Overall Uptime
        </span>
        <div className="flex shadow-sm bg-white border-gray-200 border-2 p-3 md:p-4 mt-2 h-48 md:h-64 justify-center items-center">
          <div className="flex items-center flex-row gap-10">
            <div className="flex flex-col w-32 text-center">
              <span className="text-2xl font-semibold">
                {uptimeData?.overall_uptime?.['24h']?.toFixed(3) || '100.000'}%
              </span>
              <span className="text-sm text-gray-500">Last 24 Hours</span>
            </div>
            <div
              className="w-0.5 h-20"
              style={{ backgroundColor: divider_color }}
            ></div>
            <div className="flex flex-col w-32 text-center">
              <span className="text-2xl font-semibold">
                {uptimeData?.overall_uptime?.['7d']?.toFixed(3) || '99.910'}%
              </span>
              <span className="text-sm text-gray-500">Last 7 Days</span>
            </div>
            <div
              className="w-0.5 h-20"
              style={{ backgroundColor: divider_color }}
            ></div>
            <div className="flex flex-col w-32 text-center">
              <span className="text-2xl font-semibold">
                {uptimeData?.overall_uptime?.['30d']?.toFixed(3) || '99.837'}%
              </span>
              <span className="text-sm text-gray-500">Last 30 Days</span>
            </div>
            <div
              className="w-0.5 h-20"
              style={{ backgroundColor: divider_color }}
            ></div>
            <div className="flex flex-col w-32 text-center">
              <span className="text-2xl font-semibold">
                {uptimeData?.overall_uptime?.['90d']?.toFixed(3) || '99.621'}%
              </span>
              <span className="text-sm text-gray-500">Last 90 Days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPage({ initialData }: { initialData: UptimeData | null }) {
  const [statusState, setStatusState] = useState<StatusState>({
    data: initialData,
    isLoading: initialData === null,
    lastUpdated: new Date(),
  });
  const [nextUpdate, setNextUpdate] = useState(60);

  const fetchUptimeData = async () => {
    try {
      const response = await fetch('/api/uptime');
      const apiRes = await response.json();
      const processedData = processUptimeData(apiRes);
      setStatusState({
        data: processedData,
        isLoading: false,
        lastUpdated: new Date(),
      });
      setNextUpdate(60);
    } catch (error) {
      console.error('Failed to fetch uptime data:', error);
      setStatusState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNextUpdate((prev) => {
        if (prev <= 1) {
          fetchUptimeData();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchUptimeData();
  }, []);

  const backendMonitor = statusState.data?.monitors?.find(
    (m: Monitor) =>
      m.friendly_name?.toLowerCase().includes('backend') ||
      m.friendly_name?.toLowerCase().includes('api'),
  );
  const walMonitor = statusState.data?.monitors?.find(
    (m: Monitor) =>
      m.friendly_name?.toLowerCase().includes('wal') ||
      m.friendly_name?.toLowerCase().includes('write'),
  );

  const allOperational =
    (statusState.data &&
      statusState.data.monitors.length > 0 &&
      statusState.data.monitors.every((m: Monitor) => m.status === 2)) ||
    false;

  return (
    <div className="flex flex-col relative min-h-screen overflow-y-auto">
      <MainStatus
        isLoading={statusState.isLoading}
        allOperational={allOperational}
        lastUpdated={statusState.lastUpdated}
        nextUpdate={nextUpdate}
      />
      <UptimeDetails backendMonitor={backendMonitor} walMonitor={walMonitor} />
      <OverallUptime uptimeData={statusState.data} />
    </div>
  );
}

export default function Page({
  initialStats,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const processedInitialData = initialStats
    ? processUptimeData(initialStats)
    : null;

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
        <StatusPage initialData={processedInitialData} />
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
