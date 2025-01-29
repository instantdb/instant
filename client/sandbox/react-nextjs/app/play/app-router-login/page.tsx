'use client';

import { init, User } from '@instantdb/react';
import Link from 'next/link';
import config from '../../../config';

const APP_ID = '51a157e3-3ec6-4fbf-aca7-4ab9ac6ee350';

function App() {
  const { auth, useAuth } = init({
    ...config,
    appId: APP_ID,
  });
  const { isLoading, user, error } = useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return (
      <div>
        <div>Uh oh! {error.message}</div>
        <Login auth={auth} />
      </div>
    );
  }
  if (user) {
    return <Main user={user} auth={auth} />;
  }
  return <Login auth={auth} />;
}

function Login({ auth }: { auth: any }) {
  const loginURL = auth.createAuthorizationURL({
    clientName: 'google-web',
    redirectURL: window.location.href,
  });

  return (
    <div>
      <a href={loginURL}>Log in with Google</a>
    </div>
  );
}

function Main({ user, auth }: { user: User; auth: any }) {
  return (
    <div className="p-4">
      <Link href="/">{'<-'} Home</Link>
      <h1>Hi {user.email}!</h1>
      <h2>id: {user.id}</h2>
      <button
        className="px-4 py-2 rounded border-2 my-2"
        onClick={(e) => {
          auth.signOut();
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

export default App;
