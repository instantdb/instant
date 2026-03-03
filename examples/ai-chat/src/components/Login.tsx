'use client';

import { db } from '@/lib/db';
import { id as generateId } from '@instantdb/react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

type Step = 'initial' | 'enterEmail' | 'enterCode';

export function Login() {
  const router = useRouter();
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
      .then(() => setStep('enterCode'))
      .catch((err) => setError(err.body?.message || 'Failed to send code'))
      .finally(() => setLoading(false));
  }

  function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    db.auth
      .signInWithMagicCode({ email, code })
      .then(() => router.push(`/chat/${generateId()}`))
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
      .then(() => router.push(`/chat/${generateId()}`))
      .catch((err) => setError(err.body?.message || 'Failed to sign in'))
      .finally(() => setLoading(false));
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-[400px] border border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3">
          <h1 className="text-[50px] leading-none font-bold text-gray-200">
            CHAT
          </h1>
        </div>
        <div className="px-4 py-6">
          <p className="mb-4 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
            Sign in to continue
          </p>

          {error && (
            <div className="mb-4 border border-red-200 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          {step === 'initial' && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep('enterEmail')}
                className="cursor-pointer border border-gray-200 px-4 py-3 text-[10px] font-bold tracking-wider text-gray-500 uppercase hover:bg-gray-50"
              >
                Sign in with email
              </button>
              <button
                onClick={handleGuestLogin}
                disabled={loading}
                className="cursor-pointer border border-gray-200 px-4 py-3 text-[10px] font-bold tracking-wider text-gray-500 uppercase hover:bg-gray-50 disabled:text-gray-300"
              >
                {loading ? 'Signing in...' : 'Continue as guest'}
              </button>
            </div>
          )}

          {step === 'enterEmail' && (
            <form onSubmit={handleSendCode} className="flex flex-col gap-2">
              <label className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                Email address
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="border border-gray-200 px-4 py-3 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="cursor-pointer border border-gray-200 px-4 py-3 text-[10px] font-bold tracking-wider text-gray-500 uppercase hover:bg-gray-50 disabled:text-gray-300"
              >
                {loading ? 'Sending...' : 'Send magic code'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('initial');
                  setError('');
                }}
                className="cursor-pointer py-2 text-[10px] tracking-wider text-gray-400 uppercase hover:text-gray-600"
              >
                Back
              </button>
            </form>
          )}

          {step === 'enterCode' && (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">
                We sent a code to{' '}
                <span className="font-medium text-gray-900">{email}</span>
              </p>
              <input
                type="text"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code"
                className="border border-gray-200 px-4 py-3 text-center text-lg tracking-widest outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="cursor-pointer border border-gray-200 px-4 py-3 text-[10px] font-bold tracking-wider text-gray-500 uppercase hover:bg-gray-50 disabled:text-gray-300"
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
                className="cursor-pointer py-2 text-[10px] tracking-wider text-gray-400 uppercase hover:text-gray-600"
              >
                Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
