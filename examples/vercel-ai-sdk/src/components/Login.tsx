'use client';

import { db } from '@/lib/db';
import { FormEvent, useState } from 'react';

type Step = 'initial' | 'enterEmail' | 'enterCode';

export function Login() {
  const [step, setStep] = useState<Step>('initial');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    db.auth
      .sendMagicCode({ email })
      .then(() => {
        setStep('enterCode');
      })
      .catch((err) => {
        setError(err.body?.message || 'Failed to send code');
      })
      .finally(() => setLoading(false));
  }

  function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    db.auth
      .signInWithMagicCode({ email, code })
      .catch((err) => {
        setCode('');
        setError(err.body?.message || 'Invalid code');
      })
      .finally(() => setLoading(false));
  }

  function handleGuestLogin() {
    setError('');
    setLoading(true);
    db.auth
      .signInAsGuest()
      .catch((err) => {
        setError(err.body?.message || 'Failed to sign in as guest');
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-sm p-8">
        <h1
          className="mb-1 text-2xl font-bold"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Welcome
        </h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--muted)' }}>
          Sign in to continue
        </p>

        {error && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
              color: 'var(--accent)',
            }}
          >
            {error}
          </div>
        )}

        {step === 'initial' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setStep('enterEmail')}
              className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent-2)' }}
            >
              Sign in with email
            </button>
            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="cursor-pointer rounded-xl border px-4 py-3 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ color: 'var(--ink)' }}
            >
              {loading ? 'Signing in...' : 'Continue as guest'}
            </button>
          </div>
        )}

        {step === 'enterEmail' && (
          <form onSubmit={handleSendCode} className="flex flex-col gap-3">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--muted)' }}
            >
              Email address
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ background: 'var(--bg)' }}
            />
            <button
              type="submit"
              disabled={loading}
              className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent-2)' }}
            >
              {loading ? 'Sending...' : 'Send magic code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('initial');
                setError('');
              }}
              className="cursor-pointer text-sm underline"
              style={{ color: 'var(--muted)' }}
            >
              Back
            </button>
          </form>
        )}

        {step === 'enterCode' && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              We sent a code to{' '}
              <span style={{ color: 'var(--ink)' }}>{email}</span>
            </p>
            <input
              type="text"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code"
              className="rounded-xl border px-4 py-3 text-center text-lg tracking-widest outline-none"
              style={{ background: 'var(--bg)' }}
            />
            <button
              type="submit"
              disabled={loading}
              className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent-2)' }}
            >
              {loading ? 'Verifying...' : 'Verify code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('enterEmail');
                setCode('');
                setError('');
              }}
              className="cursor-pointer text-sm underline"
              style={{ color: 'var(--muted)' }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
