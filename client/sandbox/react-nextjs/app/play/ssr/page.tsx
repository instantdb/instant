'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AddTodo } from './AddTodo';
import { TodosWithoutSuspense } from './TodosWithoutSuspense';
import { TodosWithSuspense } from './TodosWithSuspense';
import { db } from './db';

function Login() {
  const [state, setState] = useState({
    sentEmail: '',
    email: '',
    code: '',
  });
  const { sentEmail, email, code } = state;
  return (
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
                db.auth.sendMagicCode({ email }).catch((err: any) => {
                  alert('Uh oh: ' + err.body?.message);
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
            onClick={() => {
              db.auth
                .signInWithMagicCode({ email: sentEmail, code })
                .catch((err: any) => {
                  alert('Uh oh: ' + err.body?.message);
                  setState({ ...state, code: '' });
                });
            }}
          >
            Verify
          </button>
        </div>
      )}
    </div>
  );
}

function UserHeader() {
  const { isLoading, user, error } = db.useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!user) {
    return (
      <div>
        <Login />
        <button
          onClick={() => {
            db.auth.signInAsGuest();
          }}
        >
          Sign in as guest
        </button>
      </div>
    );
  }

  return (
    <div>
      Logged in as {user.email}{' '}
      <button
        onClick={() => {
          db.auth.signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <div>
      <div>
        <Link href="/play/ssr/with-fallback">Fallback version</Link>
      </div>
      <UserHeader />
      <div>
        <AddTodo />
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <TodosWithSuspense />
        </div>
        <div className="min-w-0 flex-1">
          <TodosWithoutSuspense />
        </div>
      </div>
    </div>
  );
}
