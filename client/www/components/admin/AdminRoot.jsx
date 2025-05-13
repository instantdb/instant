import React, { useState, useEffect } from 'react';
import { jsonFetch } from '../../lib/fetch';
import { useAuthToken } from '../../lib/auth';
import config from '../../lib/config';
import formatDistance from 'date-fns/formatDistance';

function fetchAdminData(token) {
  return jsonFetch(`${config.apiURI}/dash/admin`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function useAdminData(token) {
  const [state, setState] = useState({
    isLoading: true,
  });
  useEffect(() => {
    fetchAdminData(token).then(
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

export default function AdminPage() {
  const token = useAuthToken();
  const [{ isLoading, error, data }, _] = useAdminData(token);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.body.message}</div>;
  }

  const sortedUsers = data.users
    .sort((a, b) => new Date(b.user_created_at) - new Date(a.user_created_at))
    .slice(0, 50);

  window.data = sortedUsers;
  return (
    <div className="flex flex-col space-y-4">
      {sortedUsers.map((user, idx) => {
        return (
          <div key={idx} className="rounded border p-4 shadow">
            <p className="text-lg font-bold">
              Email: <span className="font-normal">{user.email}</span>
            </p>
            <p className="text-lg font-bold">
              Created At:{' '}
              <span className="font-normal">
                {new Date(user.user_created_at).toLocaleDateString()}
              </span>
            </p>
            <p className="text-lg font-bold">
              Profile Created At:{' '}
              <span className="font-normal">
                {user.profile_created_at
                  ? formatDistance(
                      new Date(user.profile_created_at),
                      new Date(user.user_created_at),
                    )
                  : ''}
              </span>
            </p>
            <p className="text-lg font-bold">
              App Created At:{' '}
              <span className="font-normal">
                {user.app_created_at && user.profile_created_at
                  ? formatDistance(
                      new Date(user.app_created_at),
                      new Date(user.profile_created_at),
                    )
                  : ''}
              </span>
            </p>
            <p className="text-lg font-bold">
              How did you hear about us?:{' '}
              <span className="font-normal">{user.meta?.heard}</span>
            </p>
            <p className="text-lg font-bold">
              What do you want to build?:{' '}
              <span className="font-normal">{user.meta?.build}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
