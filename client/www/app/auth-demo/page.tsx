'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Icons ──────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.64-2.2.52-3.06-.4C3.79 16.17 4.36 9.63 8.73 9.4c1.27.06 2.15.72 2.9.76.97-.2 1.9-.87 3.05-.79 1.37.1 2.4.65 3.08 1.64-2.8 1.68-2.14 5.37.58 6.41-.54 1.43-1.24 2.83-2.29 3.87ZM12.03 9.33c-.13-2.21 1.67-4.13 3.74-4.33.3 2.55-2.31 4.46-3.74 4.33Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

// ─── Animated Auth Demo ─────────────────────────────────

function AnimatedAuthDemo() {
  const [view, setView] = useState<'form' | 'verify' | 'success'>('form');
  const [typedEmail, setTypedEmail] = useState('');
  const [typedCode, setTypedCode] = useState('');
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const email = 'joe@instantdb.com';
  const code = '424242';

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  };

  const runCycle = useCallback(() => {
    clear();
    setView('form');
    setTypedEmail('');
    setTypedCode('');

    let t = 600;

    // Type out email character by character
    for (let i = 0; i <= email.length; i++) {
      const text = email.slice(0, i);
      sched(() => setTypedEmail(text), t + i * 60);
    }
    t += email.length * 60 + 400;

    // Transition to verify screen
    sched(() => setView('verify'), t);

    t += 600;

    // Type out code character by character
    for (let i = 0; i <= code.length; i++) {
      const text = code.slice(0, i);
      sched(() => setTypedCode(text), t + i * 80);
    }
    t += code.length * 80 + 400;

    // Transition to success screen
    sched(() => setView('success'), t);

    // Wait then restart
    t += 3000;
    sched(() => runCycle(), t);
  }, [clear]);

  useEffect(() => {
    runCycle();
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen flex-col bg-white"
    >
      <a
        href="/demos"
        className="absolute top-4 left-4 z-50 text-xs text-gray-400 hover:text-gray-600"
      >
        &larr; All Demos
      </a>
      {/* Main content */}
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait">
            {view === 'form' ? (
              <motion.div
                key="form"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="mb-2 text-2xl font-bold text-gray-900">
                  Sign in
                </h1>
                <p className="mb-8 text-base text-gray-500">
                  Welcome back! Enter your email to get started.
                </p>

                {/* Email input */}
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-base text-gray-700">
                  {typedEmail ? (
                    <span>
                      {typedEmail}
                      <span className="animate-pulse text-gray-400">|</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">you@email.com</span>
                  )}
                </div>

                {/* Send Code button */}
                <div className="mt-5 w-full rounded-lg bg-orange-500 py-3 text-center text-base font-semibold text-white">
                  Send Code
                </div>

                {/* Divider */}
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-sm text-gray-400">or</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Social buttons */}
                <div className="flex justify-center gap-4">
                  {(['Google', 'Apple', 'GitHub'] as const).map((provider) => (
                    <div
                      key={provider}
                      className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-gray-50"
                    >
                      {provider === 'Google' && <GoogleIcon />}
                      {provider === 'Apple' && <AppleIcon />}
                      {provider === 'GitHub' && <GitHubIcon />}
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : view === 'verify' ? (
              <motion.div
                key="verify"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h1 className="mb-2 text-2xl font-bold text-gray-900">
                  Check your email
                </h1>
                <p className="mb-8 text-base text-gray-500">
                  We sent a code to{' '}
                  <span className="font-medium text-gray-700">{email}</span>
                </p>

                {/* Code input */}
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Code
                </label>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-gray-700">
                  {typedCode ? (
                    <span>
                      {typedCode}
                      <span className="animate-pulse text-gray-400">|</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">------</span>
                  )}
                </div>

                {/* Verify button */}
                <div className="mt-5 w-full rounded-lg bg-orange-500 py-3 text-center text-base font-semibold text-white">
                  Verify
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-5 py-8"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100 text-3xl font-semibold text-orange-600">
                  J
                </div>
                <p className="text-2xl font-bold text-gray-900">Hello, Joe!</p>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                >
                  <svg
                    className="h-10 w-10 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function AuthDemoPage() {
  return <AnimatedAuthDemo />;
}
