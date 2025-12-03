import config from '@/lib/config'; // hide-line
import { init } from '@instantdb/react';
import { useState } from 'react';

const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

export default function InstantAuth() {
  const { isLoading, user, error } = db.useAuth();

  if (isLoading) {
    return <div className={cls.root}>Loading...</div>;
  }

  if (error) {
    return <div className={cls.root}>Uh oh! {error.message}</div>;
  }

  if (user) {
    return <div className={cls.root}>Hello {user.email}!</div>;
  }

  return <Login />;
}

function Login() {
  const [state, setState] = useState({
    sentEmail: '',
    email: '',
    error: null,
    code: '',
  });

  const { sentEmail, email, code, error } = state;

  if (!sentEmail) {
    return (
      <form
        className={cls.root}
        onSubmit={async (e) => {
          e.preventDefault();

          if (!email) return;

          setState({ ...state, sentEmail: email, error: null });

          try {
            await db.auth.sendMagicCode({ email });
          } catch (error: any) {
            setState({ ...state, error: error.body?.message });
          }
        }}
      >
        <h2 className={cls.heading}>Let's log you in!</h2>
        <input
          className={cls.input}
          placeholder="Enter your email"
          type="email"
          value={email}
          onChange={(e) =>
            setState({ ...state, email: e.target.value, error: null })
          }
        />
        <button type="submit" className={cls.button}>
          Send Code
        </button>
        {error ? <p className={cls.error}>{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      className={cls.root}
      onSubmit={async (e) => {
        e.preventDefault();

        if (!code) return;

        try {
          await db.auth.signInWithMagicCode({ email: sentEmail, code });
        } catch (error: any) {
          setState({ ...state, error: error.body?.message });
        }
      }}
    >
      <h2 className={cls.heading}>
        Okay we sent you an email! What was the code?
      </h2>
      <input
        className={cls.input}
        type="text"
        placeholder="Magic code"
        value={code || ''}
        onChange={(e) =>
          setState({ ...state, code: e.target.value, error: null })
        }
      />
      <button className={cls.button}>Verify</button>
      {error ? <p className={cls.error}>{error}</p> : null}
    </form>
  );
}

const cls = {
  root: 'flex max-w-xs mx-auto flex-col gap-3 items-center h-screen px-2 pt-12',
  heading: 'text-lg font-bold',
  input: 'py-1 border-gray-300 rounded-sm w-full',
  button: 'bg-blue-500 text-white px-3 py-1 rounded-sm w-full',
  error: 'text-red-700 text-sm bg-red-50 border-red-500 border p-2',
};
