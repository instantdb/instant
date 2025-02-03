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
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm tracking-wide uppercase font-medium">
              User email
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-left text-sm tracking-wide uppercase font-medium">
              App Title
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-right text-sm tracking-wide uppercase font-medium">
              File count
            </th>
            <th className="py-2 px-4 bg-gray-50 border-b border-gray-200 text-gray-800 text-right text-sm tracking-wide uppercase font-medium">
              Space used
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, index: number) => (
            <tr key={index}>
              <td className="py-2 px-4 border-b border-gray-200">
                {row.creator_email || '-'}
              </td>
              <td className="py-2 px-4 border-b border-gray-200">
                {row.title || '-'}
              </td>
              <td className="py-2 px-4 border-b border-gray-200 text-right">
                {row.total_file_count || 0}
              </td>

              <td className="py-2 px-4 border-b border-gray-200 text-right">
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
      <div className="p-8 max-w-4xl">
        <div className="">
          <h2 className="text-xl font-bold mb-4">Storage Usage</h2>
          <StorageMetricsTable data={data} />
        </div>
      </div>
    </div>
  );
}

export default Page;
