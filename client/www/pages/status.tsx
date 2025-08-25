import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import * as og from '@/lib/og';
import { useState, useEffect } from 'react';

function getUptimeColor(percentage: number) {
  if (percentage < 0 || percentage > 100) {
    return '#e5e7eb';
  }
  if (percentage >= 100) {
    return '#22c55e';
  } else if (percentage >= 99.9) {
    return '#86efac';
  } else if (percentage >= 99) {
    return '#fbbf24';
  } else {
    return '#fb923c';
  }
}

function StatusPage() {
  const [small, setSmall] = useState(false);
  const [uptimeData, setUptimeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [nextUpdate, setNextUpdate] = useState(60);

  const processUptimeData = (rawData: any) => {
    const monitors =
      rawData.monitors?.map((monitor: any) => {
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
          logs: monitor.logs?.slice(0, 10) || [],
        };
      }) || [];

    const overallUptime = {
      '24h':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['24h'],
          0,
        ) / (monitors.length || 1),
      '7d':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['7d'],
          0,
        ) / (monitors.length || 1),
      '30d':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['30d'],
          0,
        ) / (monitors.length || 1),
      '90d':
        monitors.reduce(
          (acc: number, m: any) => acc + m.uptime_ratio['90d'],
          0,
        ) / (monitors.length || 1),
    };

    return {
      monitors,
      overall_uptime: overallUptime,
      last_updated: new Date().toISOString(),
    };
  };

  const fetchUptimeData = async () => {
    try {
      const response = await fetch('/api/uptime');
      const rawData = await response.json();
      const processedData = processUptimeData(rawData);
      setUptimeData(processedData);
      setLastUpdated(new Date());
      setNextUpdate(60);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch uptime data:', error);
      setLoading(false);
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

  useEffect(() => {
    const animate = () => {
      setSmall(false);
      setTimeout(() => {
        setSmall(true);
        setTimeout(() => {
          animate();
        }, 3000);
      }, 100);
    };
    animate();
  }, []);

  const backendMonitor = uptimeData?.monitors?.find(
    (m: any) =>
      m.friendly_name?.toLowerCase().includes('backend') ||
      m.friendly_name?.toLowerCase().includes('api'),
  );
  const walMonitor = uptimeData?.monitors?.find(
    (m: any) =>
      m.friendly_name?.toLowerCase().includes('wal') ||
      m.friendly_name?.toLowerCase().includes('write'),
  );

  const allOperational =
    uptimeData?.monitors?.length > 0 &&
    uptimeData?.monitors?.every((m: any) => m.status === 2);
  return (
    <div className="flex flex-col relative min-h-screen overflow-y-auto">
      <div className="flex justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 z-10 py-4 md:py-8 relative">
        <div className="relative bg-white w-full max-w-4xl h-32 sm:h-44 md:h-60 border-2 border-gray-200">
          <div className="absolute top-3 right-4 text-xs md:text-sm font-mono">
            <div className="text-right">
              <div className="font-semibold text-gray-700 mb-1">
                Service Status
              </div>
              <text className="text-gray-500">
                Last updated {lastUpdated.toLocaleTimeString()} | Next update in{' '}
                {nextUpdate} sec.
              </text>
            </div>
          </div>
          <div className="flex gap-4 sm:gap-6 md:gap-8 h-full justify-center items-center px-4">
            <view
              className={`flex justify-center items-center ${uptimeData && !loading && allOperational ? 'bg-green-400' : 'bg-gray-400 w-5 h-5 sm:h-7 sm:w-7'} h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-2xl flex-shrink-0`}
            >
              <view
                className={`${uptimeData && !loading && allOperational ? 'bg-green-400' : 'bg-none'} h-8 w-8 sm:h-10 sm:w-10 absolute rounded-full shadow-2xl`}
                style={{
                  transform: small ? 'scale(3)' : 'scale(1)',
                  opacity: small ? 0 : 1,
                  transition: small
                    ? 'transform 2s ease, opacity 2s ease'
                    : 'none',
                }}
              ></view>
            </view>

            <text className="font-mono text-lg sm:text-xl md:text-2xl">
              {loading
                ? 'Loading...'
                : allOperational
                  ? 'All systems Operational'
                  : 'Failed to receive status information'}
            </text>
          </div>
        </div>
      </div>

      <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
        <div className="font-mono flex-1 max-w-4xl">
          <text className="text-sm md:text-base font-semibold">
            Uptime last 90 days
          </text>
          <div className="shadow-sm bg-white border-gray-200 border-2 p-3 md:p-4 mt-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
              <div className="flex items-center gap-2">
                <text className="text-sm md:text-base font-medium">
                  Instant backend
                </text>
                <text className="text-xs md:text-sm text-gray-500">|</text>
                <text
                  className={`text-sm md:text-base font-semibold ${backendMonitor?.uptime_ratio?.['90d'] ? 'text-green-500' : 'text-gray-400'}`}
                >
                  {backendMonitor?.uptime_ratio?.['90d']
                    ? `${backendMonitor.uptime_ratio['90d'].toFixed(3)}%`
                    : '...'}
                </text>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <view
                  className={`relative ${backendMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full flex justify-center items-center`}
                >
                  <view
                    className={`absolute ${backendMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full`}
                    style={{
                      transform: small ? 'scale(3)' : 'scale(1)',
                      opacity: small ? 0 : 0.5,
                      transition: small
                        ? 'transform 2s ease, opacity 1.8s ease'
                        : 'none',
                    }}
                  ></view>
                </view>
                <text className="text-xs md:text-sm text-gray-600">
                  {backendMonitor?.status === 2 ? 'Operational' : 'Issues Detected'}
                </text>
              </div>
            </div>
            <div className="flex h-10 gap-px">
              {(backendMonitor?.daily_uptime || Array(90).fill(null)).map(
                (percentage: number | null, index: number) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (89 - index));
                  const dateStr = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <view
                      key={index}
                      className="flex-1 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor:
                          percentage !== null ? getUptimeColor(percentage) : '#e5e7eb',
                      }}
                      title={`${dateStr}: ${percentage !== null ? `${percentage.toFixed(3)}% uptime` : 'Loading...'}`}
                    ></view>
                  );
                },
              )}
            </div>
            <div className="flex justify-between mt-2">
              <text className="text-xs text-gray-500">90 days ago</text>
              <text className="text-xs text-gray-500">Today</text>
            </div>
            <div className="flex py-6">
              <view className="bg-slate-200 h-0.5 w-full"></view>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
              <div className="flex items-center gap-2">
                <text className="text-sm md:text-base font-medium">
                  Instant WAL
                </text>
                <text className="text-xs md:text-sm text-gray-500">|</text>
                <text
                  className={`text-sm md:text-base font-semibold ${walMonitor?.uptime_ratio?.['90d'] ? 'text-green-500' : 'text-gray-400'}`}
                >
                  {walMonitor?.uptime_ratio?.['90d']
                    ? `${walMonitor.uptime_ratio['90d'].toFixed(3)}%`
                    : '...'}
                </text>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <view
                  className={`relative ${walMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full flex justify-center items-center`}
                >
                  <view
                    className={`absolute ${walMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full`}
                    style={{
                      transform: small ? 'scale(3)' : 'scale(1)',
                      opacity: small ? 0 : 0.5,
                      transition: small
                        ? 'transform 2s ease, opacity 1.8s ease'
                        : 'none',
                    }}
                  ></view>
                </view>
                <text className="text-xs md:text-sm text-gray-600">
                  {walMonitor?.status === 2 ? 'Operational' : 'Issues Detected'}
                </text>
              </div>
            </div>
            <div className="flex h-10 gap-px">
              {(walMonitor?.daily_uptime || Array(90).fill(null)).map(
                (percentage: number | null, index: number) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (89 - index));
                  const dateStr = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <view
                      key={index}
                      className="flex-1 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor:
                          percentage !== null ? getUptimeColor(percentage) : '#e5e7eb',
                      }}
                      title={`${dateStr}: ${percentage !== null ? `${percentage.toFixed(3)}% uptime` : 'Loading...'}`}
                    ></view>
                  );
                },
              )}
            </div>
            <div className="flex justify-between mt-2">
              <text className="text-xs text-gray-500">90 days ago</text>
              <text className="text-xs text-gray-500">Today</text>
            </div>
          </div>
        </div>
      </div>

      <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
        <div className="font-mono flex-1 max-w-4xl">
          <text className="text-sm md:text-base font-semibold">
            Overall Uptime
          </text>
          <div className="flex shadow-sm bg-white border-gray-200 border-2 p-3 md:p-4 mt-2 h-48 md:h-64 justify-center items-center">
            <div className="flex items-center flex-row gap-10">
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">
                  {uptimeData?.overall_uptime?.['24h']?.toFixed(3) || '100.000'}
                  %
                </text>
                <text className="text-sm text-gray-500">Last 24 Hours</text>
              </div>
              <view className="w-0.5 h-20 bg-gray-200"></view>
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">
                  {uptimeData?.overall_uptime?.['7d']?.toFixed(3) || '99.910'}%
                </text>
                <text className="text-sm text-gray-500">Last 7 Days</text>
              </div>
              <view className="w-0.5 h-20 bg-gray-200"></view>
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">
                  {uptimeData?.overall_uptime?.['30d']?.toFixed(3) || '99.837'}%
                </text>
                <text className="text-sm text-gray-500">Last 30 Days</text>
              </div>
              <view className="w-0.5 h-20 bg-gray-200"></view>
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">
                  {uptimeData?.overall_uptime?.['90d']?.toFixed(3) || '99.621'}%
                </text>
                <text className="text-sm text-gray-500">Last 90 Days</text>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
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
        <StatusPage />
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
