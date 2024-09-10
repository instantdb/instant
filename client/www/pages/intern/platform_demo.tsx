import {
  Button,
  Copyable,
  Fence,
  SectionHeading,
  TextInput,
} from '@/components/ui';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { useState } from 'react';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';

const createAppCurl = (token: string): string => {
  return `
export PLATFORM_TOKEN="${token}"
curl -X POST "${config.apiURI}/superadmin/apps" \\
  -H "Authorization: Bearer $PLATFORM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "my cool app"}'  
`.trim();
};

function AppStage({ token, app }: { token: string; app: { id: string } }) {
  return (
    <div>
      Wohoo! Here's your app:
    </div>
  )
}

function PlatformTokenStage({ token }: { token: string }) {
  const [app, setApp] = useLocalStorage<any>('app');
  return (
    <div className="">
      <h2>1. Create apps</h2>
      <p>Here's the cURL:</p>
      <div className="not-prose">
        <div className="space-y-2">
          <div className="border">
            <Fence
              code={createAppCurl(token)}
              language="bash"
              className="overflow-auto h-full w-full p-8 m-0 text-sm"
              style={{ margin: 0 }}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={async () => {
              const res = await jsonFetch(`${config.apiURI}/superadmin/apps`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title: 'my cool app' }),
              });
              setApp(res.app);
            }}
          >
            Try it!
          </Button>
        </div>
        {app ? <AppStage app={app} token={token} /> : null}
      </div>
    </div>
  );
}
export default function Page() {
  const isHydrated = useIsHydrated();
  const [platformToken, setPlatformToken] =
    useLocalStorage<string>('__platformToken');
  if (!isHydrated) return;
  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="space-y-4 prose">
        <SectionHeading className="font-bold">
          Here's a demo of the Platform Beta!
        </SectionHeading>
        <p>
          First,{' '}
          <a href="/dash?s=personal-access-tokens" target="_blank">
            <span className="text-blue-500 font-bold cursor-pointer">
              go to this page and get a personal access token
            </span>
          </a>
        </p>
        <p>Once you have it, paste it into this input:</p>
        <TextInput
          value={platformToken || ''}
          onChange={(v) => setPlatformToken(v.trim())}
          placeholder="the-token-you-copied"
        />
        {platformToken ? <PlatformTokenStage token={platformToken} /> : null}
      </div>
    </div>
  );
}
