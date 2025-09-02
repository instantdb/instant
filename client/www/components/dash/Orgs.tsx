import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { useContext } from 'react';
import { Button } from '../ui';
import { useDashFetch } from '@/lib/hooks/useDashFetch';

function createOrg(token: string, params: { title: string }) {
  return jsonFetch(`${config.apiURI}/dash/orgs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(params),
  });
}

function deleteOrg(token: string, params: { id: string }) {
  return jsonFetch(`${config.apiURI}/dash/orgs/${params.id}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

export default function Orgs() {
  const token = useContext(TokenContext);

  const dashResponse = useDashFetch();

  if (dashResponse.isLoading) {
    return <div>Loading...</div>;
  }

  if (dashResponse.error || !dashResponse.data) {
    return (
      <div>
        Error: <pre>{JSON.stringify(dashResponse.error, null, 2)}</pre>
      </div>
    );
  }

  const orgs = dashResponse.data.orgs;

  return (
    <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto">
      <div>
        {(orgs || []).map((org) => {
          return (
            <div>
              {org.title}{' '}
              <Button
                variant="subtle"
                onClick={async () => {
                  await deleteOrg(token, { id: org.id });
                  dashResponse.mutate();
                }}
              >
                Delete
              </Button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between flex-row items-center">
        <Button
          onClick={async () => {
            const title = prompt('Give your org a name');
            try {
              if (!title) {
                throw new Error('Missing title.');
              }
              await createOrg(token, { title: title });
              dashResponse.mutate();
            } catch (e) {
              console.error('Error creating org', e);
              alert((e as Error).message);
            }
          }}
        >
          Create new org
        </Button>
      </div>
    </div>
  );
}
