'use client';

import React, { useState } from 'react';
import db from '@/lib/intern/docs-feedback/db';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, error } = db.useAuth();

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  if (error)
    return <div className="p-4 text-red-500">Auth error: {error.message}</div>;
  if (!user) return <Login />;

  return <>{children}</>;
}

function Login() {
  const [sentEmail, setSentEmail] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        {!sentEmail ? (
          <EmailStep onSendEmail={setSentEmail} />
        ) : (
          <CodeStep sentEmail={sentEmail} />
        )}
      </div>
    </div>
  );
}

function EmailStep({ onSendEmail }: { onSendEmail: (email: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const email = inputEl.value;
    onSendEmail(email);
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert('Error: ' + err.body?.message);
      onSendEmail('');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          Feedback Analytics
        </h2>
        <p className="text-gray-600">
          Enter your email to access the analytics dashboard
        </p>
      </div>

      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Email address
        </label>
        <input
          ref={inputRef}
          id="email"
          type="email"
          required
          autoFocus
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          placeholder="Enter your email"
        />
      </div>

      <button
        type="submit"
        className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-hidden"
      >
        Send Magic Code
      </button>
    </form>
  );
}

function CodeStep({ sentEmail }: { sentEmail: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const code = inputEl.value;
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      inputEl.value = '';
      alert('Error: ' + err.body?.message);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          Enter verification code
        </h2>
        <p className="text-gray-600">
          We sent a verification code to <strong>{sentEmail}</strong>. Check
          your email and enter the code below.
        </p>
      </div>

      <div>
        <label
          htmlFor="code"
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Verification code
        </label>
        <input
          ref={inputRef}
          id="code"
          type="text"
          required
          autoFocus
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          placeholder="Enter verification code"
        />
      </div>

      <button
        type="submit"
        className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-hidden"
      >
        Verify Code
      </button>
    </form>
  );
}
