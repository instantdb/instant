import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';
import { Button, Content, Copyable, SectionHeading } from '@/components/ui';
import { useAuthToken } from '@/lib/auth';
import config, { bugsAndQuestionsInviteUrl } from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

function fetchDebugUriInfo(
  { traceId, spanId }: { traceId: string; spanId: string },
  token: string | undefined,
) {
  return jsonFetch(
    `${config.apiURI}/dash/admin-debug-uri?trace-id=${traceId}&span-id=${spanId}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    },
  );
}

function AdminInfo({ urls }: { urls: { label: string; url: string }[] }) {
  return (
    <div className="flex flex-col gap-4 items-center">
      <div>Admin URLs</div>
      {urls.map((u) => (
        <a
          key={u.url}
          target="_blank"
          href={u.url}
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800"
        >
          {u.label}
        </a>
      ))}
    </div>
  );
}

function Page() {
  const router = useReadyRouter();

  const token = useAuthToken();

  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<any | null>(null);
  useEffect(() => {
    setCurrentUrl(window.location.href);
    const spanId = router.query['span-id'] as string;
    const traceId = router.query['trace-id'] as string;
    if (token) {
      fetchDebugUriInfo({ traceId, spanId }, token).then(
        (res) => setAdminInfo(res),
        (_err) => {
          console.log('No extra info.');
        },
      );
    }
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-12 flex flex-col items-center justify-center gap-4 p-8">
      <div className="text-4xl">🐞</div>
      {adminInfo ? (
        <AdminInfo urls={adminInfo.urls} />
      ) : (
        <p>We don't have any additional information about this error.</p>
      )}
      <p>
        Ping us with this url in{' '}
        <a
          className="text-blue-600 underline hover:text-blue-800"
          rel="noopener noreferrer"
          href={bugsAndQuestionsInviteUrl}
        >
          #bug-and-questions on Discord
        </a>{' '}
        for help.
      </p>

      {currentUrl ? (
        <div className="w-96">
          <Copyable label="URL" value={currentUrl} />
        </div>
      ) : null}

      <Button type="link" href="/dash">
        Back to the dash
      </Button>
    </div>
  );
}

const ClientPage = asClientOnlyPage(Page);

export default ClientPage;
