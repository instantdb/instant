import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';
import { Button, Copyable } from '@/components/ui';
import { useAuthToken } from '@/lib/auth';
import config, { bugsAndQuestionsInviteUrl } from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useState } from 'react';

function QueryBlock({ query }: { query: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative w-full">
      <pre className="w-full overflow-x-auto rounded border bg-gray-50 p-3 pr-10 text-left font-mono text-xs text-gray-700">
        {query}
      </pre>
      <button
        type="button"
        aria-label="Copy query"
        onClick={() => {
          navigator.clipboard
            .writeText(query)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
        }}
        className="absolute top-2 right-2 cursor-pointer rounded border border-gray-200 bg-white p-1 text-gray-500 shadow-xs hover:bg-gray-50 hover:text-gray-700"
      >
        {copied ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <ClipboardDocumentIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

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

function AdminInfo({
  urls,
  traceId,
  spanId,
}: {
  urls: { label: string; url: string; query?: string }[];
  traceId: string;
  spanId: string;
}) {
  const agentPrompt = `Investigate this trace. Read server/querying-logs.md.\n\ntrace_id: ${traceId}\nspan_id: ${spanId}`;
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <div>Admin URLs</div>
      {urls.map((u) => (
        <div key={u.url} className="flex w-full flex-col items-center gap-2">
          <a
            target="_blank"
            href={u.url}
            rel="noopener noreferrer"
            onClick={() => {
              if (u.query) {
                navigator.clipboard.writeText(u.query).catch(() => {});
              }
            }}
            className="text-blue-600 underline hover:text-blue-800"
          >
            {u.label}
            {u.query ? ' (opens link and copies query to clipboard)' : ''}
          </a>
          {u.query ? <QueryBlock query={u.query} /> : null}
        </div>
      ))}
      <div className="flex w-full flex-col items-center gap-2">
        <div>Prompt for agent</div>
        <QueryBlock query={agentPrompt} />
      </div>
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
    <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-4 p-8 px-4 py-12">
      <div className="text-4xl">🐞</div>
      {adminInfo ? (
        <AdminInfo
          urls={adminInfo.urls}
          traceId={router.query['trace-id'] as string}
          spanId={router.query['span-id'] as string}
        />
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
