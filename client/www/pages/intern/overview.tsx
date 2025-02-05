import React, { useEffect, useState } from 'react';

import { useAuthToken } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';

import { FullscreenLoading, LogoIcon } from '@/components/ui';
import Head from 'next/head';
import { format, parse } from 'date-fns';
import useCurrentDate from '@/lib/hooks/useCurrentDate';

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

function mergeOrigins(originsA: any, originsB: any) {
  const ret = { ...originsA };
  for (const origin in originsB) {
    if (origin in ret) {
      ret[origin] += originsB[origin];
    } else {
      ret[origin] = originsB[origin];
    }
  }
  return ret;
}

function mergeSessions(sessA: any, sessB: any) {
  const ret = { ...sessA };
  ret.count += sessB.count;
  ret.origins = mergeOrigins(sessA.origins, sessB.origins);

  return ret;
}

function flattenedSessionReports(machineToReport: any) {
  const res: any = {};
  for (const memberId in machineToReport) {
    const memberReports = machineToReport[memberId];
    for (const sessionId in memberReports) {
      const curr = memberReports[sessionId];
      const prev = res[sessionId];
      res[sessionId] = prev ? mergeSessions(prev, curr) : curr;
    }
  }
  const items = Object.values(res);
  return items;
}

const OriginColumn = ({ origins }: { origins: any }) => {
  if (!origins || Object.keys(origins).length === 0) return '-';

  const originEntries = Object.entries(origins).toSorted(
    (a: any, b: any) => b[1] - a[1],
  );
  const [mostFrequentOrigin] = originEntries[0];
  const otherCount = originEntries.length - 1;

  const isLocalhost = mostFrequentOrigin.includes('localhost');
  return (
    <span>
      {isLocalhost ? (
        mostFrequentOrigin
      ) : (
        <a href={mostFrequentOrigin} target="_blank" rel="noreferrer">
          {mostFrequentOrigin}
        </a>
      )}
      {otherCount > 0 && (
        <span className="text-sm text-gray-500">
          {' '}
          (+{otherCount} other{otherCount > 1 ? 's' : ''})
        </span>
      )}
    </span>
  );
};

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
  ).toSorted((a: any, b: any) => b.count - a.count);
  const totalSessions = sessions.reduce(
    (acc: number, x: any) => acc + x.count,
    0,
  );
  const dateAnalyzed = parse(daily.data.date, 'yyyy-MM-dd', new Date());
  const totalApps = Object.keys(sessions).length;
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
        <div className="flex-1 p-4 space-y-2 flex flex-col min-h-0">
          <h3 className="text-lg">{format(minute.sentAt, 'hh:mma')}</h3>
          <div className="flex justify-between items-baseline">
            <div className="inline-flex items-baseline space-x-4 justify-between">
              <h1 className="leading-none" style={{ fontSize: 120 }}>
                {totalSessions}
              </h1>
              <div className="font-bold leading-none">Active Connections</div>
            </div>
            <div className="inline-flex items-baseline space-x-4">
              <h3 className="font-bold" style={{ fontSize: 30 }}>
                {totalApps}
              </h3>
              <div>Active Apps</div>
            </div>
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
                    <td className="px-4 py-2">
                      <OriginColumn origins={session['origins']} />
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
