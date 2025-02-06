import Head from 'next/head';
import React, { useEffect, useState } from 'react';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { useAuthToken } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';

function fetchGraphData(token: string | undefined) {
  return jsonFetch(`${config.apiURI}/dash/investor_updates`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function useGraphData(token: string | undefined) {
  const [state, setState] = useState<{
    isLoading: boolean;
    error: undefined | { body: { message: string } };
    data: any | undefined;
  }>({
    isLoading: true,
    error: undefined,
    data: undefined,
  });
  useEffect(() => {
    fetchGraphData(token).then(
      (data) => {
        setState({
          isLoading: false,
          error: undefined,
          data,
        });
      },
      (err) => {
        setState({
          isLoading: false,
          error: err.body
            ? err
            : {
                body: {
                  message: err.message || 'Uh oh, we goofed up',
                  hint: err.hint,
                },
              },
          data: undefined,
        });
      },
    );
  }, [token]);

  return state;
}

function round(num: number, precision = 2) {
  return Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
}

function Page() {
  const isHydrated = useIsHydrated();
  const token = useAuthToken();
  const { isLoading, error, data } = useGraphData(token);

  if (!isHydrated) return null;

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div>
        Error: <pre>{JSON.stringify(error.body, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div>
      <Head>
        <title>Instant Investor Update Metrics</title>
        <meta name="description" content="Welcome to Instant." />
      </Head>
      <div className="p-4">
        <div>
          Monthly Active Apps M/M Growth:{' '}
          {round(data.metrics['monthly-active-apps-mom'], /* precision = */ 1)}%
        </div>
        <div>
          Monthly Active Devs M/M Growth:{' '}
          {round(data.metrics['monthly-active-devs-mom'], /* precision = */ 1)}%
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-items-center">
          <img src={data.metrics.charts['monthly-active-apps']} />
          <img src={data.metrics.charts['monthly-active-devs']} />
          <img src={data.metrics.charts['weekly-active-apps']} />
          <img src={data.metrics.charts['weekly-active-devs']} />
        </div>
      </div>
    </div>
  );
}

export default Page;
