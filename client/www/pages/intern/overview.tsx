import React, { use, useEffect, useState } from 'react';

import { useAuthToken } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';

import { FullscreenLoading, LogoIcon } from '@/components/ui';
import Head from 'next/head';
import { format, parse, subDays } from 'date-fns';

async function fetchDailyOverview(token: string) {
  return jsonFetch(`${config.apiURI}/dash/overview/daily`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

async function fetchMinuteOverview(token: string) {
  return jsonFetch(`${config.apiURI}/dash/overview/minute`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function useCurrentDate({ refreshSeconds }: { refreshSeconds: number }) {
  const [date, setDate] = useState(new Date());
  const refreshMs = refreshSeconds * 1000;
  useEffect(() => {
    const interval = setInterval(() => {
      setDate(new Date());
    }, refreshMs);
    return () => clearInterval(interval);
  }, [refreshMs]);
  return date;
}

function useDailyOverview(token: string) {
  const sentAt = useCurrentDate({ refreshSeconds: 60 * 5 });
  const [state, setState] = useState<any>({
    isLoading: true,
    error: undefined,
    data: undefined,
  });
  useEffect(() => {
    let cancel = false;
    async function exec() {
      try {
        const data = await fetchDailyOverview(token);
        if (cancel) return;
        setState({ data, error: undefined, isLoading: false });
      } catch (error) {
        if (cancel) return;
        setState({ data: undefined, error, isLoading: false });
      }
    }
    exec();
    return () => {
      cancel = true;
    };
  }, [token, sentAt]);

  return { ...state, sentAt };
}

function useMinuteOverview(token: string) {
  const sentAt = useCurrentDate({ refreshSeconds: 30 });
  const [state, setState] = useState<any>({
    isLoading: true,
    error: undefined,
    data: undefined,
  });
  useEffect(() => {
    let cancel = false;
    async function exec() {
      try {
        const data = await fetchMinuteOverview(token);
        if (cancel) return;
        setState({ data, error: undefined, isLoading: false });
      } catch (error) {
        if (cancel) return;
        setState({ data: undefined, error, isLoading: false });
      }
    }
    exec();
    return () => {
      cancel = true;
    };
  }, [token, sentAt]);

  return { ...state, sentAt };
}

function flattenedSessionReports(machineToReport: any) {
  const merged: any = {};
  for (const memberId in machineToReport) {
    const memberReports = machineToReport[memberId];
    for (const sessionId in memberReports) {
      const session = memberReports[sessionId];
      if (merged[sessionId]) {
        merged[sessionId].count = merged[sessionId].count + session.count;
      } else {
        merged[sessionId] = { ...session };
      }
    }
  }
  const items = Object.values(merged);
  return items;
}

export function Main() {
  const token = useAuthToken();
  const daily = useDailyOverview(token!);
  const minute = useMinuteOverview(token!);
  if (daily.isLoading || minute.isLoading) return <FullscreenLoading />;
  if (daily.error || minute.error) {
    return (
      <div>
        Error: <pre>{JSON.stringify(daily.error.body, null, 2)}</pre>
      </div>
    );
  }
  const rollingStats = daily.data['data-points']['rolling-monthly-stats'];
  const latestRolling = rollingStats[rollingStats.length - 1];
  const charts = daily.data['charts'];
  const sessions = flattenedSessionReports(
    minute.data['session-reports'],
  ).toSorted((a: any, b: any) => a.count - b.count);
  const totalSessions = sessions.reduce(
    (acc: number, x: any) => acc + x.count,
    0,
  );
  const dateAnalyzed = parse(daily.data.date, 'yyyy-MM-dd', new Date());
  return (
    <div className="flex flex-col font-mono min-h-0">
      <div className="p-4 space-x-4 flex items-center border-b">
        <LogoIcon size="normal" />
        <h3 className="text-xl">
          <span className="font-bold">instant</span> metrics
        </h3>
      </div>
      <div className="flex min-h-0">
        <div className="flex-1 p-4 space-y-2">
          <div>
            <h3 className="text-lg">{format(dateAnalyzed, 'MMMM d, yyyy')}</h3>
            <div className="inline-flex items-baseline space-x-4">
              <h1 className="leading-none" style={{ fontSize: 120 }}>
                {latestRolling['distinct_apps']}
              </h1>
              <div className="font-bold leading-none">Monthly Active Apps</div>
            </div>
            <div className="flex space-y-4">
              <div>
                <img src={charts['rolling-monthly-active-apps']} />
              </div>
              <div>
                <img src={charts['month-to-date-active-apps']} />
              </div>
            </div>
          </div>
          <div className="flex space-x-4">
            <div>
              <h3 className="font-bold" style={{ fontSize: 30 }}>
                {latestRolling['distinct_users']}
              </h3>
              <div>Monthly Active Devs</div>
            </div>
          </div>
        </div>
        {/* I want this part to scroll */}
        <div className="flex-1 p-4 space-y-2 flex flex-col min-h-0">
          <h3 className="text-lg">{format(minute.sentAt, 'hh:mma')}</h3>
          <div className="inline-flex items-baseline space-x-4">
            <h1 className="leading-none" style={{ fontSize: 120 }}>
              {totalSessions}
            </h1>
            <div className="font-bold leading-none">Active Connections</div>
          </div>
          <div className="mt-4 border overflow-y-scroll">
            <table className="w-full">
              <tbody>
                {sessions.map((session: any, i) => (
                  <tr key={session['app-title'] + i}>
                    <td className="px-4 py-2">{session['app-title']}</td>
                    <td className="px-4 py-2">
                      {session['creator-email'] || '-'}
                    </td>
                    <td className="px-4 py-2 text-right">{session.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const isHydrated = useIsHydrated();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
      <Head>
        <title>Instant Overview</title>
        <meta name="description" content="Welcome to Instant." />
      </Head>
      <div className="flex flex-1 flex-col overflow-hidden">
        {isHydrated ? <Main /> : null}
      </div>
    </div>
  );
}
