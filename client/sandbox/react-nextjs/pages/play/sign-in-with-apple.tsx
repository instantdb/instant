import { init, tx, id, User } from '@instantdb/react';
import config from '../../config';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const db = init(config);

function loadScript(src: string, id: string, callback: () => void) {
  if (document.getElementById(id)) {
    if (callback) {
      callback();
    }
    return;
  }

  const script = document.createElement('script');
  script.src = src;
  script.id = id;
  script.type = 'text/javascript';
  script.async = true;

  script.onload = () => {
    if (callback) {
      callback();
    }
  };

  script.onerror = () => {
    console.error(`Failed to load script: ${src}`);
  };

  document.body.appendChild(script);
}

function App() {
  const { isLoading, user, error } = db.useAuth();

  if (isLoading) {
    return <div>Loading Instant...</div>;
  }

  if (error) {
    return (
      <div>
        <div>Uh oh! {error.message}</div>
        <Login />
      </div>
    );
  }

  if (user) {
    return <Main user={user} />;
  }

  return <Login />;
}

async function signInPopup() {
  let AppleID = (window as any).AppleID;
  let nonce = crypto.randomUUID();
  let resp = await AppleID.auth.signIn({
    nonce: nonce,
    usePopup: true,
  });
  await db.auth.signInWithIdToken({
    clientName: 'apple',
    idToken: resp.authorization.id_token,
    nonce: nonce,
  });
}

// 4. Create Login button
function Login() {
  const [redirectUrl] = useState(() =>
    db.auth.createAuthorizationURL({
      clientName: 'apple',
      redirectURL: window.location.href,
    }),
  );

  useEffect(() => {
    const scriptUrl =
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    loadScript(scriptUrl, 'appleid_auth', () => {
      let AppleID = (window as any).AppleID;
      if (AppleID) {
        AppleID.auth.renderButton();
        AppleID.auth.init({
          clientId: 'com.instantdb.signin.test',
          scope: 'name email',
          redirectURI: window.location.href,
        });
      }
    });
  });

  return (
    <div className="w-lvw h-screen flex flex-col justify-center items-center gap-4">
      <button
        style={{
          fontFamily: 'SF Pro, -apple-system, BlinkMacSystemFont, sans-serif',
          background: '#000',
          color: '#FFF',
          padding: '4pt 12pt',
          borderRadius: '4pt',
        }}
        onClick={signInPopup}
      >
        􀣺 Sign in with popup
      </button>
      <a
        href={redirectUrl}
        style={{
          fontFamily: 'SF Pro, -apple-system, BlinkMacSystemFont, sans-serif',
          background: '#000',
          color: '#FFF',
          padding: '4pt 12pt',
          borderRadius: '4pt',
        }}
      >
        􀣺 Sign in with redirect
      </a>
    </div>
  );
}

// 6. Make queries to your heart's content!
// Checkout InstaQL for examples
// https://paper.dropbox.com/doc/InstaQL--BgBK88TTiSE9OV3a17iCwDjCAg-yVxntbv98aeAovazd9TNL
function Main({ user }: { user: User }) {
  const { isLoading, error, data } = db.useQuery({ goals: { todos: {} } });
  if (isLoading) return <div>Loading Query...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return (
    <div className="p-4">
      <Link href="/">{'<-'} Home</Link>
      <h1>Hi {user.email}!</h1>
      <h2>id: {user.id}</h2>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded border-2 my-2"
        onClick={(e) => {
          const todoAId = id();
          const todoBId = id();
          db.transact([
            tx.todos[todoAId].update({
              title: 'Go on a run',
              creatorId: user.id,
            }),
            tx.todos[todoBId].update({
              title: 'Drink a protein shake',
              creatorId: user.id,
            }),
            tx.goals[id()]
              .update({
                title: 'Get six pack abs',
                priority6: 1,
                creatorId: user.id,
              })
              .link({ todos: todoAId })
              .link({ todos: todoBId }),
          ]);
        }}
      >
        Create some example data
      </button>
      <button
        className="px-4 py-2 bg-red-500 text-white rounded border-2 my-2"
        onClick={(e) => {
          const goalIds = data.goals.map((g) => g.id);
          const todoIds = data.goals
            .map((g) => g.todos.map((t) => t.id))
            .flat();
          db.transact([
            ...goalIds.map((id) => tx.goals[id].delete()),
            ...todoIds.map((id) => tx.todos[id].delete()),
          ]);
        }}
      >
        Clear Data
      </button>

      <button
        className="px-4 py-2 rounded border-2 my-2"
        onClick={(e) => {
          db.auth.signOut();
        }}
      >
        Sign Out
      </button>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default App;
