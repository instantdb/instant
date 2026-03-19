import { useState } from 'react';
import { useRecipeDB } from './db';

export default function InstantAuth() {
  const db = useRecipeDB();

  return (
    <div className={cls.root}>
      <db.SignedIn>
        <Dashboard />
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </div>
  );
}

function Dashboard() {
  const db = useRecipeDB();
  const user = db.useUser();

  return (
    <div className={cls.card}>
      <h2 className={cls.heading}>Welcome!</h2>
      <p className={cls.description}>
        You are signed in as <strong>{user.email}</strong>
      </p>
      <button className={cls.secondaryButton} onClick={() => db.auth.signOut()}>
        Sign Out
      </button>
    </div>
  );
}

function Login() {
  const db = useRecipeDB();
  const [state, setState] = useState({
    sentEmail: '',
    email: '',
    code: '',
    error: '',
  });

  const { sentEmail, email, code, error } = state;

  if (!sentEmail) {
    return (
      <form
        className={cls.card}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email) return;
          setState({ ...state, sentEmail: email, error: '' });
          try {
            await db.auth.sendMagicCode({ email });
          } catch (err: any) {
            setState({ ...state, sentEmail: '', error: err.body?.message });
          }
        }}
      >
        <h2 className={cls.heading}>Let's log you in</h2>
        <p className={cls.description}>
          Enter your email and we'll send you a verification code.
        </p>
        <input
          className={cls.input}
          placeholder="Enter your email"
          type="email"
          value={email}
          onChange={(e) =>
            setState({ ...state, email: e.target.value, error: '' })
          }
        />
        <button type="submit" className={cls.button} disabled={!email.trim()}>
          Send Code
        </button>
        {error ? <p className={cls.error}>{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      className={cls.card}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code) return;
        try {
          await db.auth.signInWithMagicCode({ email: sentEmail, code });
        } catch (err: any) {
          setState({ ...state, error: err.body?.message });
        }
      }}
    >
      <h2 className={cls.heading}>Enter your code</h2>
      <p className={cls.description}>
        We sent a code to <strong>{sentEmail}</strong>
      </p>
      <input
        autoFocus
        className={cls.input}
        type="text"
        inputMode="numeric"
        placeholder="Verification code"
        value={code}
        onChange={(e) =>
          setState({ ...state, code: e.target.value, error: '' })
        }
      />
      <button type="submit" className={cls.button} disabled={!code.trim()}>
        Verify Code
      </button>
      <button
        type="button"
        className={cls.secondaryButton}
        onClick={() =>
          setState({ sentEmail: '', email: '', code: '', error: '' })
        }
      >
        Back
      </button>
      {error ? <p className={cls.error}>{error}</p> : null}
    </form>
  );
}

const cls = {
  root: 'flex h-full items-center justify-center px-2',
  card: 'flex w-full max-w-xs flex-col gap-3',
  heading: 'text-lg font-bold',
  description: 'text-sm text-gray-600',
  input:
    'rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400 w-full',
  button:
    'rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 w-full disabled:opacity-50',
  secondaryButton:
    'rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 w-full',
  error: 'text-red-700 text-sm bg-red-50 border border-red-500 rounded-sm p-2',
};
