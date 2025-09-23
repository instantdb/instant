import Head from 'next/head';
import React, { useEffect, useState } from 'react';

import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { useAuthToken } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import { formatBytes } from '@/lib/format';
import config from '@/lib/config';

function fetchStorageMetrics(token: string | undefined) {
  return jsonFetch(`${config.apiURI}/dash/storage`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function useStorageMetrics(token: string | undefined) {
  const [state, setState] = useState<{
    isLoading: boolean;
    error: any;
    data: any | undefined;
  }>({
    isLoading: true,
    error: undefined,
    data: undefined,
  });

  useEffect(() => {
    fetchStorageMetrics(token).then(
      (data) => {
        setState({ isLoading: false, error: undefined, data: data.apps });
      },
      (err) => {
        setState({ isLoading: false, error: err, data: undefined });
      },
    );
  }, [token]);

  return state;
}

function StorageMetricsTable({ data }: { data: any }) {
  return (
    <div>
      <table className="min-w-full border border-gray-200 bg-white">
        <thead>
          <tr>
            <th className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium uppercase tracking-wide text-gray-800">
              User email
            </th>
            <th className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-sm font-medium uppercase tracking-wide text-gray-800">
              App Title
            </th>
            <th className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-right text-sm font-medium uppercase tracking-wide text-gray-800">
              File count
            </th>
            <th className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-right text-sm font-medium uppercase tracking-wide text-gray-800">
              Space used
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, index: number) => (
            <tr key={index}>
              <td className="border-b border-gray-200 px-4 py-2">
                {row.creator_email || '-'}
              </td>
              <td className="border-b border-gray-200 px-4 py-2">
                {row.title || '-'}
              </td>
              <td className="border-b border-gray-200 px-4 py-2 text-right">
                {row.total_file_count || 0}
              </td>

              <td className="border-b border-gray-200 px-4 py-2 text-right">
                {formatBytes(row.total_byte_size)}
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
  const { isLoading, error, data } = useStorageMetrics(token);

  if (!isHydrated) {
    return null;
  } else if (isLoading) {
    return <div className="p-8 text-gray-400">Loading...</div>;
  } else if (error) {
    return <div className="p-8 text-red-500">Error: {error.body.message}</div>;
  }

  return (
    <div>
      <Head>
        <title>Instant Storage Usage</title>
      </Head>
      <div className="max-w-4xl p-8">
        <div className="">
          <h2 className="mb-4 text-xl font-bold">Storage Usage</h2>
          <StorageMetricsTable data={data} />
        </div>
      </div>
    </div>
  );
}

export default Page;
