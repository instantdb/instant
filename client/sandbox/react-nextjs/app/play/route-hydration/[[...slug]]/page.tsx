'use client';
// Now in your App.js
import React, { useEffect, useState } from 'react';

// 1. Import Instant
import { init, tx, id } from '@instantdb/react';
import config from '../../../../config';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 2. Get your app id
const { auth, useAuth, transact, useQuery } = init(config);

function App() {
  const [mountedIsLoading, setMountedIsLoading] = useState<boolean | null>(
    null,
  );
  const { isLoading, user, error } = useAuth();
  useEffect(() => {
    setMountedIsLoading(isLoading);
  }, []);
  if (isLoading) {
    return <div>...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <Main appIsLoading={mountedIsLoading} />;
  }
  return <Login />;
}

// 4. Log users in!
function Login() {
  const [state, setState] = useState({
    sentEmail: '',
    email: '',
    code: '',
  });
  const { sentEmail, email, code } = state;
  return (
    <div>
      <div>
        {!sentEmail ? (
          <div key="em">
            <h2>Let's log you in!</h2>
            <div>
              <input
                placeholder="Enter your email"
                type="email"
                value={email}
                onChange={(e) => setState({ ...state, email: e.target.value })}
              />
            </div>
            <div>
              <button
                onClick={() => {
                  setState({ ...state, sentEmail: email });
                  auth.sendMagicCode({ email }).catch((err) => {
                    alert('Uh oh :' + err.body?.message);
                    setState({ ...state, sentEmail: '' });
                  });
                }}
              >
                Send Code
              </button>
            </div>
          </div>
        ) : (
          <div key="cd">
            <h2>Okay we sent you an email! What was the code?</h2>
            <div>
              <input
                type="text"
                placeholder="Code plz"
                value={code || ''}
                onChange={(e) => setState({ ...state, code: e.target.value })}
              />
            </div>
            <button
              onClick={(e) => {
                auth
                  .signInWithMagicCode({ email: sentEmail, code })
                  .catch((err) => {
                    alert('Uh oh :' + err.body?.message);
                    setState({ ...state, code: '' });
                  });
              }}
            >
              Verify
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function colorize(k: string, isLoading: boolean | null | undefined) {
  return (
    <span
      style={{
        color:
          typeof isLoading === 'boolean'
            ? isLoading
              ? 'red'
              : 'green'
            : 'green',
      }}
    >
      {k}: {typeof isLoading === 'boolean' ? isLoading.toString() : '...'}
    </span>
  );
}

// 5. Make queries to your heart's content!
// Checkout InstaQL for examples
// https://paper.dropbox.com/doc/InstaQL--BgBK88TTiSE9OV3a17iCwDjCAg-yVxntbv98aeAovazd9TNL
function Main({ appIsLoading }: { appIsLoading: boolean | null }) {
  const pathname = usePathname();
  const [mountedState, setMountedState] = useState<{
    authLoading?: boolean;
    queryLoading?: boolean;
  }>({});
  const authResult = useAuth();
  const { isLoading: authLoading } = authResult;
  const queryResult = useQuery({ goals: { todos: {} } });
  const { isLoading: queryLoading } = queryResult;
  useEffect(() => {
    setMountedState({ authLoading, queryLoading });
  }, []);
  return (
    <div className="p-4">
      <div className="space-x-2 text-blue-500">
        <Link href="/play/route-hydration/1">page 1</Link>
        <Link href="/play/route-hydration/2">page 2</Link>
      </div>
      <div>
        <p>Mounted State: {pathname}</p>
        <p>{colorize('App:auth:loading', appIsLoading)}</p>
        <p>{colorize('Main:auth:loading', mountedState.authLoading)}</p>
        <p>{colorize('Main:query:loading', mountedState.queryLoading)}</p>
      </div>
      <div>Here's what is expected.</div>
      <div>
        <ul>
          <li>
            <strong>The first time you load this page</strong>
            <ul>
              <li>App:auth:loading will be `true`</li> (because IDB _has not_
              loaded yet)
              <li>
                Main:auth:loading will be `false` (because IDB has already
                loaded)
              </li>
              <li>
                Main:query:loading will be `false` (because IDB has already
                loaded)
              </li>
            </ul>
          </li>
          <li>
            <strong>Now click on one of the pages</strong>
            <ul>
              <li>
                App:auth:loading will be `false` (because the navigation
                happened client-side)
              </li>
              <li>
                Main:auth:loading will be `false` (because IDB has already
                loaded)
              </li>
              <li>
                Main:query:loading will be `false` (because IDB has already
                loaded)
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default App;
