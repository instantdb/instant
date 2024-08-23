import Head from 'next/head';
import React, { useEffect, useState } from 'react';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { useAuthToken } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import { formatDistanceToNow } from 'date-fns';

function fetchPaidData(token: string | undefined) {
  return jsonFetch(`${config.apiURI}/dash/paid`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function usePaidData(token: string | undefined) {
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
    fetchPaidData(token).then(
      (data) => {
        setState({
          isLoading: false,
          error: undefined,
          data: data.subscriptions,
        });
      },
      (err) => {
        setState({
          isLoading: false,
          error: err.body
            ? err
            : { body: { message: err.message || 'Uh oh, we goofed up' } },
          data: undefined,
        });
      }
    );
  }, [token]);

  return state;
}

function formatMoney(cents: number) {
  const dollars = cents / 100;
  // Format as currency (you can customize the locale and currency)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

function formatStartTimestamp(ts: number) {
  return formatDistanceToNow(new Date(ts * 1000));
}

function humanBytes(bytes: number) {
  const units = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb', 'eb', 'zb', 'yb'];
  let index = 0;

  if (bytes === 0) return '0 bytes';

  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index++;
  }

  return bytes.toFixed(2) + ' ' + units[index];
}

function PaidTable({ data }: { data: any }) {
  return (
    <div>
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium">
              User email
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium">
              App Title
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium">
              Monthly prevenue
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium">
              Subscribed since
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium">
              DB size
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: any) => (
            <tr key={row.user_email + row.app_title}>
              <td className="py-2 px-4 border-b border-gray-200">
                {row.user_email}
              </td>
              <td className="py-2 px-4 border-b border-gray-200">
                {row.app_title}
              </td>
              <td className="py-2 px-4 border-b border-gray-200">
                <span className="ml-2">{formatMoney(row.monthly_revenue)}</span>
              </td>
              <td className="py-2 px-4 border-b border-gray-200">
                <span
                  title={new Date(row.start_timestamp * 1000).toLocaleString()}
                >
                  {formatStartTimestamp(row.start_timestamp)}
                </span>
              </td>
              <td className="py-2 px-4 border-b border-gray-200">
                {humanBytes(row.usage)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Page() {
  const isHydrated = useIsHydrated();
  const token = useAuthToken();
  const { isLoading, error, data } = usePaidData(token);

  if (!isHydrated) return null;

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.body.message}</div>;
  }

  return (
    <div>
      <Head>
        <title>Instant Paid Apps</title>
        <meta name="description" content="Welcome to Instant." />
      </Head>
      <div className="flex space-x-0 space-y-4 md:space-x-8 md:space-y-0 m-4 flex-wrap md:flex-nowrap">
        <div className="flex flex-col space-y-2">
          <span className="font-xl font-bold">Paid Apps</span>
          <PaidTable data={data} />
        </div>
      </div>
    </div>
  );
}

export default Page;
