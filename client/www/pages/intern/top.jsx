import Head from 'next/head';
import React, { useEffect, useState } from 'react';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { useAuthToken } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import { getQueryParam } from '@/lib/url';
import config from '@/lib/config';

function getDays() {
  return getQueryParam('n') || 7;
}

function fetchTopData(token) {
  const n = getDays();
  return jsonFetch(`${config.apiURI}/dash/top?n=${n}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function useTopData(token) {
  const [state, setState] = useState({
    isLoading: true,
  });
  useEffect(() => {
    fetchTopData(token).then(
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
            : { body: { message: err.message || 'Uh oh, we goofed up' } },
          data: undefined,
        });
      },
    );
  }, [token]);

  return [state, setState];
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function TopUsersTable({ data }) {
  const [sortConfig, setSortConfig] = useState({
    key: 'total_transactions',
    direction: 'desc',
  });
  const topData = data.users;

  const sortedData = topData.sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const totalApps = sortedData.length;
  const totalTransactions = sortedData.reduce(
    (acc, app) => acc + app.total_transactions,
    0,
  );

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div>
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('user_email')}
            >
              User Email ({totalApps}){' '}
              {sortConfig.key === 'user_email' &&
                (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('app_title')}
            >
              App Title{' '}
              {sortConfig.key === 'app_title' &&
                (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('total_transactions')}
            >
              Transactions ({formatNumber(totalTransactions)}){' '}
              {sortConfig.key === 'total_transactions' &&
                (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((app) => (
            <tr key={app.user_email + app.app_title}>
              <td className="py-2 px-4 border-b border-gray-200">
                {app.user_email}
              </td>
              <td className="py-2 px-4 border-b border-gray-200">
                {app.app_title}
              </td>
              <td className="py-2 px-4 border-b border-gray-200 flex items-center">
                <div
                  className="h-4 bg-green-500"
                  style={{
                    width: `${(app.total_transactions / totalTransactions) * 100}%`,
                  }}
                />
                <span className="ml-2">
                  {formatNumber(app.total_transactions)}
                </span>
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
  const [{ isLoading, error, data }, _] = useTopData(token);

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
        <title>Instant Top Users</title>
      </Head>
      <div className="flex space-x-0 space-y-4 md:space-x-8 md:space-y-0 m-4 flex-wrap md:flex-nowrap">
        <div className="flex flex-col space-y-2">
          <span className="font-xl font-bold">
            Top Users Last {getDays()} Days
          </span>
          <TopUsersTable data={data} />
        </div>
      </div>
    </div>
  );
}

export default Page;
