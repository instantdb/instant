'use client';

import { db } from '@/lib/db';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type EmailStep = 'idle' | 'enterEmail' | 'enterCode';

export function UserMenu() {
  const { user } = db.useAuth();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isGuest = !user?.email;
  const showDot = isGuest && !dismissed;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (emailStep !== 'enterCode') {
          setEmailStep('idle');
          setError('');
        }
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [emailStep]);

  function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    db.auth
      .sendMagicCode({ email })
      .then(() => setEmailStep('enterCode'))
      .catch((err) => setError(err.body?.message || 'Failed to send code'))
      .finally(() => setLoading(false));
  }

  function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    db.auth
      .signInWithMagicCode({ email, code })
      .then(() => {
        setEmailStep('idle');
        setOpen(false);
        toast.success('Email added to your account');
      })
      .catch((err) => {
        setCode('');
        setError(err.body?.message || 'Invalid code');
      })
      .finally(() => setLoading(false));
  }

  if (!user) return null;

  return (
    <div ref={ref} className="relative z-10">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setDismissed(true);
        }}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border bg-white/60 transition hover:bg-white"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-[var(--muted)]"
        >
          <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M2.5 14.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {showDot && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium text-[var(--ink)]">
              {user.email || 'Guest'}
            </p>
            {isGuest && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Temporary account
              </p>
            )}
          </div>

          {isGuest && emailStep === 'idle' && (
            <button
              onClick={() => setEmailStep('enterEmail')}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--bg)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Add email
            </button>
          )}

          {emailStep === 'enterEmail' && (
            <form onSubmit={handleSendCode} className="border-b px-4 py-3">
              {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg)' }}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent-2)' }}
                >
                  {loading ? 'Sending...' : 'Send code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailStep('idle');
                    setError('');
                  }}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--bg)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {emailStep === 'enterCode' && (
            <form onSubmit={handleVerifyCode} className="border-b px-4 py-3">
              <p className="mb-2 text-xs text-[var(--muted)]">
                Code sent to <span className="text-[var(--ink)]">{email}</span>
              </p>
              {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
              <input
                type="text"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code"
                className="w-full rounded-lg border px-3 py-2 text-center text-sm tracking-widest outline-none"
                style={{ background: 'var(--bg)' }}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent-2)' }}
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailStep('enterEmail');
                    setCode('');
                    setError('');
                  }}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--bg)]"
                >
                  Back
                </button>
              </div>
            </form>
          )}

          <button
            onClick={() => {
              setOpen(false);
              setEmailStep('idle');
              db.auth.signOut();
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--ink)]"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
