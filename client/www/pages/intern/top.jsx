import Head from 'next/head';
import React, { useEffect, useState } from 'react';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { useAuthToken } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';

function fetchTopData(token) {
  return jsonFetch(`${config.apiURI}/dash/top`, {
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
      }
    );
  }, [token]);

  return [state, setState];
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getAverageTransactions(data) {
  const appMap = new Map();
  data.users.forEach((week) => {
    const weekEnd = week.week_end;
    week.details.forEach((app) => {
      const key = `${app.user_email}_${app.app_title}`;
      if (!appMap.has(key)) {
        appMap.set(key, {
          user_email: app.user_email,
          app_title: app.app_title,
          total_transactions: app.total_transactions,
          weeks: 1,
          transactions: { [weekEnd]: app.total_transactions },
        });
      } else {
        const existingApp = appMap.get(key);
        existingApp.total_transactions += app.total_transactions;
        existingApp.weeks += 1;
        existingApp.transactions[weekEnd] = app.total_transactions;
      }
    });
  });

  return Array.from(appMap.values()).map((app) => {
    app.avg_transactions = app.total_transactions / app.weeks;
    return app;
  });
}

function TopUsersTable({ data }) {
  const [sortConfig, setSortConfig] = useState({ key: 'total_transactions', direction: 'desc' });
  const latestWeekData = data.users[0].details;

  const sortedData = latestWeekData.sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const totalApps = sortedData.length;
  const totalTransactions = sortedData.reduce((acc, app) => acc + app.total_transactions, 0);

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
              User Email ({totalApps}) {sortConfig.key === 'user_email' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('app_title')}
            >
              App Title {sortConfig.key === 'app_title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('total_transactions')}
            >
              Transactions ({formatNumber(totalTransactions)}) {sortConfig.key === 'total_transactions' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((app) => (
            <tr key={app.user_email + app.app_title}>
              <td className="py-2 px-4 border-b border-gray-200">{app.user_email}</td>
              <td className="py-2 px-4 border-b border-gray-200">{app.app_title}</td>
              <td className="py-2 px-4 border-b border-gray-200 flex items-center">
                <div
                  className="h-4 bg-green-500"
                  style={{
                    width: `${(app.total_transactions / totalTransactions) * 100}%`,
                  }}
                />
                <span className="ml-2">{formatNumber(app.total_transactions)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/**
 * Height is relative to average transactions for the app. We scale height
 * and cap height to make spark chart more readable.
 */
const scaledHeight = (tx, avgTx, scalingFactor = 50, maxHeight = 100) => {
  const ratio = tx / avgTx;
  return Math.min(ratio * scalingFactor, maxHeight);
};

/**
  * Get the keys of the spark chart data for the last 4 weeks
  */
const sparkKeys = (app, cutOffDate) => {
  return Object.keys(app.transactions).filter(d => new Date(d) >= cutOffDate).reverse()
}

function TopAllTimeTable({ data }) {
  const [sortConfig, setSortConfig] = useState({ key: 'total_transactions', direction: 'desc' });
  const appData = getAverageTransactions(data);
  const sortedApps = appData
    .sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    })
    .slice(0, 50);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const totalApps = sortedApps.length;
  const totalTransactions = sortedApps.reduce((acc, app) => acc + app.total_transactions, 0);

  // Get spark chart cuttoff date for last 4 weeks
  const latestDate = data.users[0].week_end;
  const cutOffDate = new Date(latestDate);
  cutOffDate.setDate(cutOffDate.getDate() - 21);

  return (
    <div>
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('user_email')}
            >
              User Email ({totalApps})  {sortConfig.key === 'user_email' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('app_title')}
            >
              App Title {sortConfig.key === 'app_title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('total_transactions')}
            >
              Transactions ({formatNumber(totalTransactions)}) {sortConfig.key === 'total_transactions' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('weeks')}
            >
              Weeks of Data {sortConfig.key === 'weeks' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th
              className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium cursor-pointer"
              onClick={() => handleSort('avg_transactions')}
            >
              Average Transactions {sortConfig.key === 'avg_transactions' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm uppercase font-medium">Spark Chart (Last 4 Weeks)</th>
          </tr>
        </thead>
        <tbody>
          {sortedApps.map((app) => (
            <tr key={app.user_email + app.app_title}>
              <td className="py-2 px-4 border-b border-gray-200">{app.user_email}</td>
              <td className="py-2 px-4 border-b border-gray-200">{app.app_title}</td>
              <td className="py-2 px-4 border-b border-gray-200 flex items-center">
                <div
                  className="h-4 bg-green-500"
                  style={{
                    width: `${(app.total_transactions / totalTransactions) * 100}%`,
                  }}
                />
                <span className="ml-2">{formatNumber(app.total_transactions)}</span>
              </td>
              <td className="py-2 px-4 border-b border-gray-200">{app.weeks}</td>
              <td className="py-2 px-4 border-b border-gray-200">{formatNumber(Math.round(app.avg_transactions))}</td>
              <td className="py-2 px-4 border-b border-gray-200">
                {Object.keys(app.transactions).length >= 4 ? (
                  <div className="flex items-center h-12">
                    {sparkKeys(app, cutOffDate).map((d, index) => (
                      <div
                        key={index}
                        className="h-4 mx-1 bg-green-500"
                        style={{
                          width: '20px',
                          height: `${scaledHeight(app.transactions[d], app.avg_transactions)}%`,
                          display: 'inline-block',
                        }}>
                        <span className="absolute mb-2 w-max px-2 py-1 bg-gray-700 text-white text-xs rounded opacity-0 hover:opacity-100">
                          <p>{new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>Num tx: {app.transactions[d]}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">Not enough data</span>
                )}
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
        <meta name="description" content="Welcome to Instant." />
      </Head>
      <div className="flex space-x-0 space-y-4 md:space-x-8 md:space-y-0 m-4 flex-wrap md:flex-nowrap">
        <div className="flex flex-col space-y-2">
          <span className="font-xl font-bold">Top Users Last 7 Days</span>
          <TopUsersTable data={data} />
        </div>
        <div className="flex flex-col space-y-2">
          <span className="font-xl font-bold">Top 50 users all time</span>
          <TopAllTimeTable data={data} />
        </div>
      </div>
    </div>
  );
}

export default Page;
