import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { useContext, useState } from 'react';
import { Button } from '../ui';
import { useDashFetch } from '@/lib/hooks/useDashFetch';
import { useAuthedFetch } from '@/lib/auth';
import { createApp } from '@/pages/dash';
import { v4 } from 'uuid';

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

function OrgDetails({ id }: { id: string }) {
  const token = useContext(TokenContext);
  const resp = useAuthedFetch(`${config.apiURI}/dash/orgs/${id}`);
  if (resp.isLoading) {
    return <div>Loading...</div>;
  }

  if (resp.error || !resp.data) {
    return (
      <div>
        Error: <pre>{JSON.stringify(resp.error, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="p-8">
      <pre className="text-sm">{JSON.stringify(resp.data, null, 2)}</pre>
      <Button
        onClick={async () => {
          const appTitle = prompt('Give your app a name');
          if (!appTitle) {
            return;
          }
          try {
            await createApp(token, {
              id: v4(),
              title: appTitle,
              admin_token: v4(),
              org_id: id,
            });
            resp.mutate();
          } catch (e) {
            console.error('Error creating app', e);
          }
        }}
      >
        Add App
      </Button>
    </div>
  );
}

export default function Orgs() {
  const token = useContext(TokenContext);

  const dashResponse = useDashFetch();

  const [expandedOrgs, setExpandedOrgs] = useState<string[]>([]);

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

  console.log(expandedOrgs);

  return (
    <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto overflow-scroll">
      <div>
        {(orgs || []).map((org) => {
          const expanded = expandedOrgs.includes(org.id);
          return (
            <div key={org.id}>
              <Button
                variant="subtle"
                onClick={() => {
                  if (expanded) {
                    setExpandedOrgs(expandedOrgs.filter((x) => x !== org.id));
                  } else {
                    setExpandedOrgs([...expandedOrgs, org.id]);
                  }
                }}
              >
                {org.title}
              </Button>
              <Button
                variant="subtle"
                onClick={async () => {
                  try {
                    await deleteOrg(token, { id: org.id });

                    dashResponse.mutate();
                  } catch (e) {
                    console.log('Error deleting org', e);
                    alert((e as Error).message || (e as any).body?.message);
                  }
                }}
              >
                Delete
              </Button>
              {expanded ? <OrgDetails id={org.id} /> : null}
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
              alert((e as Error).message || (e as any).body?.message);
            }
          }}
        >
          Create new org
        </Button>
      </div>
    </div>
  );
}
