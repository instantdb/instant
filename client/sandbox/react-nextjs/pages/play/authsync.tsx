// 1. Import Instant
import { init, tx, id } from '@instantdb/react';
import config from '../../config';
import { useEffect, useState } from 'react';

// 2. Get your app id
const db = init(config);

async function getToken() {
  const res = await fetch('http://localhost:3005/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'stopa@instantdb.com' }),
  });
  return await res.json();
}

function App() {
  const { isLoading, user } = db.useAuth();
  const [calledSignIn, setCalledSignIn] = useState(false);
  const [result, setResult] = useState<any>(null);
  useEffect(() => {
    if (calledSignIn && !result) {
      setResult({ calledSignIn, user });
    }
  }, [user, calledSignIn]);
  return (
    <div>
      <div className="space-x-2 space-y-2">
        <button
          onClick={() => {
            db.auth.signOut();
          }}
        >
          Sign out
        </button>
        <button
          onClick={async () => {
            const ret = await getToken();
            await db.auth.signInWithToken(ret.token);
            setCalledSignIn(true);
          }}
        >
          Sign in
        </button>
      </div>
      <pre>
        {JSON.stringify({ isLoading, user, calledSignIn, result }, null, 2)}
      </pre>
      <div>
        This playground tests that if `signInWithToken` is finished, `useAuth`
        _should_ already have the user.
        <br />
      </div>
    </div>
  );
}

export default App;
