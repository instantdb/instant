import { useEffect } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import differenceInDays from 'date-fns/differenceInDays';

import { Button } from '@/components/ui';
import { getLocal, isDev } from '@/lib/config';
import * as ephemeral from '@/lib/ephemeral';
import useLocalStorage from '@/lib/hooks/useLocalStorage';

type State =
  | { step: 'init' }
  | { step: 'provisioning' }
  | { step: 'ready'; appId: string; expiresMs: number };

export default function TodoIframeDemo() {
  const [state, setState] = useLocalStorage<State>(
    'launch-todo-iframe-demo',
    { step: 'init' },
  );

  // If the cached ephemeral app is about to expire, reset so we provision
  // a fresh one on the next click. Mirrors AgentsEssayDemoSection.
  useEffect(() => {
    if (state.step !== 'ready') return;
    if (differenceInDays(new Date(state.expiresMs), new Date()) < 2) {
      setState({ step: 'init' });
    }
  }, [state]);

  const handleSpinUp = async () => {
    setState({ step: 'provisioning' });
    try {
      const res = await ephemeral.provisionApp({
        title: 'launch-todo-iframe-demo',
      });
      setState({
        step: 'ready',
        appId: res.app.id,
        expiresMs: res.expires_ms,
      });
    } catch (e) {
      setState({ step: 'init' });
    }
  };

  if (state.step === 'ready') {
    return <Iframes appId={state.appId} />;
  }

  return (
    <div className="not-prose my-6">
      <div className="relative">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-[440px] rounded-xl border border-gray-200 bg-gray-50" />
          <div className="h-[440px] rounded-xl border border-gray-200 bg-gray-50" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/75 backdrop-blur-sm">
          <p className="px-6 text-center font-mono text-sm text-gray-500">
            Spin up a backend to try the live demo.
          </p>
          <Button
            variant="cta"
            disabled={state.step === 'provisioning'}
            onClick={handleSpinUp}
          >
            {state.step === 'provisioning' ? 'Spinning up…' : 'Try the demo'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Iframes({ appId }: { appId: string }) {
  const devBackend = getLocal('devBackend');
  const uri = `/launch-todo?a=${appId}${devBackend ? '&localBackend=1' : ''}`;
  const fullUri = `${
    isDev ? 'http://localhost:3000' : 'https://instantdb.com'
  }${uri}`;

  return (
    <div className="not-prose my-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <BrowserFrame
        uri={uri}
        fullUri={fullUri}
        avatar={{ src: '/img/landing/stopa.jpg', alt: 'Stopa' }}
      />
      <BrowserFrame
        uri={uri}
        fullUri={fullUri}
        avatar={{ src: '/img/landing/joe.jpg', alt: 'Joe' }}
      />
    </div>
  );
}

function BrowserFrame({
  uri,
  fullUri,
  avatar,
}: {
  uri: string;
  fullUri: string;
  avatar: { src: string; alt: string };
}) {
  return (
    <div className="flex h-[440px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <div className="flex flex-1 items-center gap-2 truncate rounded bg-white px-2 py-1 text-xs text-gray-500">
          <span className="truncate">{fullUri}</span>
          <a
            href={fullUri}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0"
          >
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
          </a>
        </div>
        <img
          src={avatar.src}
          alt={avatar.alt}
          className="h-6 w-6 flex-shrink-0 rounded-full object-cover ring-2 ring-white"
        />
      </div>
      <iframe src={uri} className="h-full w-full flex-1 border-0" />
    </div>
  );
}
