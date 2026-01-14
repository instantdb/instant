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
      },
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

const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});
const numericKeys = new Set([
  'monthly_revenue',
  'start_timestamp',
  'usage',
  'triple_count',
]);

function PaidTable({ data }: { data: any }) {
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const getSortValue = React.useCallback((row: any, key: string) => {
    const value = row?.[key];
    if (value === null || value === undefined) return null;
    if (numericKeys.has(key)) {
      const numericValue = Number(value);
      return Number.isNaN(numericValue) ? null : numericValue;
    }
    return String(value);
  }, []);

  const sortedData = React.useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (numericKeys.has(sortConfig.key)) {
        const delta = aVal - bVal;
        if (delta === 0) return 0;
        return sortConfig.direction === 'asc' ? delta : -delta;
      }
      const comparison = collator.compare(aVal, bVal);
      if (comparison === 0) return 0;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, getSortValue, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === 'desc'
    ) {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return ' ↕️';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div>
      <table className="min-w-full border border-gray-200 bg-white">
        <thead>
          <tr>
            <th
              className="cursor-pointer border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium text-gray-800 uppercase hover:bg-gray-100"
              onClick={() => handleSort('user_email')}
            >
              User email{getSortIndicator('user_email')}
            </th>
            <th
              className="cursor-pointer border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium text-gray-800 uppercase hover:bg-gray-100"
              onClick={() => handleSort('type')}
            >
              Type{getSortIndicator('type')}
            </th>
            <th
              className="cursor-pointer border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium text-gray-800 uppercase hover:bg-gray-100"
              onClick={() => handleSort('title')}
            >
              Title{getSortIndicator('title')}
            </th>
            <th
              className="cursor-pointer border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium text-gray-800 uppercase hover:bg-gray-100"
              onClick={() => handleSort('monthly_revenue')}
            >
              Monthly prevenue{getSortIndicator('monthly_revenue')}
            </th>
            <th
              className="cursor-pointer border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium text-gray-800 uppercase hover:bg-gray-100"
              onClick={() => handleSort('start_timestamp')}
            >
              Subscribed since{getSortIndicator('start_timestamp')}
            </th>
            <th
              className="cursor-pointer border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium text-gray-800 uppercase hover:bg-gray-100"
              onClick={() => handleSort('usage')}
            >
              DB size{getSortIndicator('usage')}
            </th>
            <th
              className="cursor-pointer border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium text-gray-800 uppercase hover:bg-gray-100"
              onClick={() => handleSort('triple_count')}
            >
              Triple count{getSortIndicator('triple_count')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row: any) => (
            <tr key={row.user_email + row.app_title}>
              <td className="border-b border-gray-200 px-4 py-2">
                {row.user_email}
              </td>
              <td className="border-b border-gray-200 px-4 py-2">{row.type}</td>
              <td className="border-b border-gray-200 px-4 py-2">
                {row.title}
              </td>
              <td className="border-b border-gray-200 px-4 py-2">
                <span className="ml-2">{formatMoney(row.monthly_revenue)}</span>
              </td>
              <td className="border-b border-gray-200 px-4 py-2">
                <span
                  title={new Date(row.start_timestamp * 1000).toLocaleString()}
                >
                  {formatStartTimestamp(row.start_timestamp)}
                </span>
              </td>
              <td className="border-b border-gray-200 px-4 py-2">
                {humanBytes(row.usage)}
              </td>
              <td className="border-b border-gray-200 px-4 py-2">
                {row.triple_count
                  ? Intl.NumberFormat().format(row.triple_count)
                  : null}
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
      <div className="m-4 flex flex-wrap space-y-4 space-x-0 md:flex-nowrap md:space-y-0 md:space-x-8">
        <div className="flex flex-col space-y-2">
          <span className="font-xl font-bold">Paid Apps</span>
          <PaidTable data={data} />
        </div>
      </div>
    </div>
  );
}

export default Page;
