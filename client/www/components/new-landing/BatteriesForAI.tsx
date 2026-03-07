'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AnimateIn } from './AnimateIn';
import { RevenueDashboardDemo } from './PaymentsIdea_Dashboard';
import { LiveStreamDemo } from './LiveStreamDemo';
import { StreamsDemoJoin } from './StreamsDemoEventFeed';

// ─── Auth Demo ───────────────────────────────────────────

function AuthDemo() {
  const [view, setView] = useState<'form' | 'success'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSendCode = () => {
    const derived = email.includes('@')
      ? email.split('@')[0].charAt(0).toUpperCase() +
        email.split('@')[0].slice(1)
      : 'Friend';
    setName(derived);
    setView('success');
  };

  const handleSocial = (provider: string) => {
    setName(provider);
    setView('success');
  };

  return (
    <div className="flex items-center justify-center rounded-xl p-4">
      <div className="w-full max-w-[280px]">
        <AnimatePresence mode="wait">
          {view === 'form' ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl bg-white p-5 shadow-sm"
            >
              <p className="mb-3 text-sm font-semibold text-gray-800">
                Sign in
              </p>

              {/* Email input */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-1 focus:ring-orange-200 focus:outline-none"
              />

              {/* Send Code button */}
              <button
                onClick={handleSendCode}
                className="mt-3 w-full rounded-lg bg-orange-500 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 active:scale-[0.98]"
              >
                Send Code
              </button>

              {/* Divider */}
              <div className="my-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Social buttons */}
              <div className="flex justify-center gap-3">
                {(['Google', 'Apple', 'GitHub'] as const).map((provider) => (
                  <button
                    key={provider}
                    onClick={() => handleSocial(provider)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm transition-colors hover:border-orange-300 hover:bg-orange-50 active:scale-95"
                  >
                    {provider === 'Google' && <GoogleIcon />}
                    {provider === 'Apple' && <AppleIcon />}
                    {provider === 'GitHub' && <GitHubIcon />}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-lg font-semibold text-orange-600">
                {name[0]}
              </div>
              <p className="text-sm font-semibold text-gray-800">
                Welcome, {name}!
              </p>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <svg
                  className="h-6 w-6 text-green-500"
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
              <a
                href="/docs/auth"
                className="mt-1 text-xs font-medium text-orange-500 transition-colors hover:text-orange-600"
              >
                Add this to your app in 2 minutes →
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
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
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.64-2.2.52-3.06-.4C3.79 16.17 4.36 9.63 8.73 9.4c1.27.06 2.15.72 2.9.76.97-.2 1.9-.87 3.05-.79 1.37.1 2.4.65 3.08 1.64-2.8 1.68-2.14 5.37.58 6.41-.54 1.43-1.24 2.83-2.29 3.87ZM12.03 9.33c-.13-2.21 1.67-4.13 3.74-4.33.3 2.55-2.31 4.46-3.74 4.33Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

// ─── Permissions Demo ────────────────────────────────────

const permRules = [
  { action: 'read', rule: 'true' },
  { action: 'create', rule: 'isOwner' },
  { action: 'update', rule: 'isOwner' },
  { action: 'delete', rule: 'false' },
];

const permUsers = [
  { id: 'anon', name: 'Anyone' },
  { id: 'alice', name: 'Alice' },
  { id: 'louis', name: 'Louis' },
];

const permOps = ['read', 'create', 'update', 'delete'] as const;

function evaluatePermission(userId: string, op: string): boolean {
  if (op === 'read') return true;
  if (op === 'delete') return false;
  // create & update use isOwner — passes for any logged-in user
  return userId !== 'anon';
}

function PermissionsDemo() {
  const [selectedUser, setSelectedUser] = useState('alice');
  const [selectedOp, setSelectedOp] = useState('read');
  const [userOpen, setUserOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);

  const allowed = evaluatePermission(selectedUser, selectedOp);
  const activeRuleIdx = permRules.findIndex((r) => r.action === selectedOp);
  const activeUser = permUsers.find((u) => u.id === selectedUser)!;

  return (
    <div className="space-y-4">
      {/* Query: [User] can [op] → verdict */}
      <div className="flex items-center gap-1.5 text-sm">
        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setUserOpen(!userOpen);
              setOpOpen(false);
            }}
            className="rounded-md bg-white px-2.5 py-1 font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 transition-colors hover:ring-gray-300"
          >
            {activeUser.name}
            <span className="ml-1 text-gray-400">&#9662;</span>
          </button>
          {userOpen && (
            <div className="absolute top-full left-0 z-10 mt-1 rounded-md bg-white py-1 shadow-lg ring-1 ring-gray-200">
              {permUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUser(u.id);
                    setUserOpen(false);
                  }}
                  className={`block w-full px-3 py-1 text-left text-sm hover:bg-gray-50 ${
                    selectedUser === u.id
                      ? 'font-semibold text-gray-900'
                      : 'text-gray-600'
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-gray-400">can</span>
        {/* Op dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setOpOpen(!opOpen);
              setUserOpen(false);
            }}
            className="rounded-md bg-white px-2.5 py-1 font-mono font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 transition-colors hover:ring-gray-300"
          >
            {selectedOp}
            <span className="ml-1 text-gray-400">&#9662;</span>
          </button>
          {opOpen && (
            <div className="absolute top-full left-0 z-10 mt-1 rounded-md bg-white py-1 shadow-lg ring-1 ring-gray-200">
              {permOps.map((op) => (
                <button
                  key={op}
                  onClick={() => {
                    setSelectedOp(op);
                    setOpOpen(false);
                  }}
                  className={`block w-full px-3 py-1 text-left font-mono text-sm hover:bg-gray-50 ${
                    selectedOp === op
                      ? 'font-semibold text-gray-900'
                      : 'text-gray-600'
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <AnimatePresence mode="wait">
          <motion.span
            key={allowed ? 'allowed' : 'denied'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`font-mono text-sm font-semibold ${allowed ? 'text-green-600' : 'text-red-500'}`}
          >
            {allowed ? '✓ allowed' : '✗ denied'}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Rules table */}
      <div>
        <div className="font-mono text-xs">
          <p className="px-2 py-1 text-gray-400">messages</p>
          <p className="px-2 py-1 pl-6 text-gray-400">allow</p>
          <div className="divide-y divide-gray-100 pl-10">
            {permRules.map((r, i) => (
              <div key={r.action} className="relative px-2 py-1.5">
                {activeRuleIdx === i && (
                  <motion.div
                    layoutId="perm-highlight"
                    className="absolute inset-0 rounded bg-gray-100"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span
                  className={`relative font-semibold ${activeRuleIdx === i ? 'text-gray-900' : 'text-gray-400'}`}
                >
                  {r.action}
                </span>
                <span
                  className={`relative ${activeRuleIdx === i ? 'text-gray-600' : 'text-gray-400'}`}
                >
                  : {r.rule}
                </span>
              </div>
            ))}
          </div>
          <p className="px-2 py-1 pl-6 text-gray-400">bind</p>
          <div className="px-2 py-1.5 pl-10">
            <span className="font-semibold text-gray-400">isOwner</span>
            <span className="text-gray-400">: auth.id == data.creator</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Storage Demo ────────────────────────────────────────

function StorageFakeCursor({
  x,
  y,
  clicking,
}: {
  x: number;
  y: number;
  clicking: boolean;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-10"
      initial={false}
      animate={{ left: x, top: y, scale: clicking ? 0.85 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M1 1L1 15L5 11L9 18L12 16.5L8 9.5L13 9L1 1Z"
          fill="black"
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
    </motion.div>
  );
}

function StorageDemo() {
  const [phase, setPhase] = useState<
    'compose' | 'dragging' | 'uploading' | 'typing' | 'post'
  >('compose');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [showDragThumb, setShowDragThumb] = useState(false);
  const [imageDropped, setImageDropped] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const heartRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  const caption = 'Newest member of the team';

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  };

  const animateHeart = () => {
    const target = heartRef.current;
    if (!target) return;

    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.innerText = '❤️';
      target.appendChild(el);

      const size = 14 + Math.random() * 14;
      const xDrift = (Math.random() - 0.5) * 60;
      const yDist = -(50 + Math.random() * 40);
      const delay = i * 60;
      const duration = 600 + Math.random() * 300;
      const rotation = (Math.random() - 0.5) * 40;

      Object.assign(el.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        fontSize: `${size}px`,
        lineHeight: '1',
        pointerEvents: 'none',
        zIndex: '9999',
        transform: 'translate(-50%, -50%) scale(0)',
        opacity: '1',
        transition: `transform ${duration}ms cubic-bezier(0.2, 0.6, 0.3, 1), opacity ${duration}ms ease-out`,
        transitionDelay: `${delay}ms`,
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Object.assign(el.style, {
            transform: `translate(calc(-50% + ${xDrift}px), calc(-50% + ${yDist}px)) scale(1) rotate(${rotation}deg)`,
            opacity: '0',
          });
        });
      });

      setTimeout(() => el.remove(), duration + delay + 50);
    }
  };

  const runCycle = useCallback(() => {
    clear();
    setPhase('compose');
    setShowCursor(false);
    setClicking(false);
    setUploadProgress(0);
    setTypedText('');
    setShowDragThumb(false);
    setImageDropped(false);

    let t = 400;

    // Cursor appears from the right, carrying a thumbnail
    sched(() => {
      setCursorPos({ x: 230, y: 80 });
      setShowCursor(true);
      setShowDragThumb(true);
      setPhase('dragging');
    }, t);

    t += 500;

    // Drag to the dropzone center
    sched(() => setCursorPos({ x: 110, y: 130 }), t);

    t += 800;

    // Drop the image
    sched(() => setClicking(true), t);
    t += 200;
    sched(() => {
      setClicking(false);
      setShowDragThumb(false);
      setImageDropped(true);
      setPhase('uploading');
    }, t);

    // Upload progress bar fills over ~1s
    const uploadDuration = 1000;
    const uploadSteps = 20;
    const stepMs = uploadDuration / uploadSteps;
    for (let i = 1; i <= uploadSteps; i++) {
      const progress = (i / uploadSteps) * 100;
      sched(() => setUploadProgress(progress), t + i * stepMs);
    }
    t += uploadDuration + 300;

    // Move cursor to text area (below the image)
    sched(() => {
      setPhase('typing');
      setCursorPos({ x: 35, y: 195 });
    }, t);

    t += 400;

    // Type out caption character by character
    for (let i = 0; i <= caption.length; i++) {
      const text = caption.slice(0, i);
      sched(() => setTypedText(text), t + i * 50);
    }
    t += caption.length * 50 + 500;

    // Transition to post view
    sched(() => setPhase('post'), t);

    t += 600;

    // Cursor moves to heart
    sched(() => setCursorPos({ x: 18, y: 280 }), t);

    t += 500;

    // Heart click
    sched(() => setClicking(true), t);
    t += 200;
    sched(() => {
      setClicking(false);
      animateHeart();
    }, t);

    t += 400;

    // Hide cursor — animation ends, user can interact freely
    sched(() => setShowCursor(false), t);
  }, [clear]);

  const handleHeartClick = () => {
    if (phase !== 'post') return;
    animateHeart();
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          runCycle();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [runCycle, clear]);

  return (
    <div ref={containerRef} className="relative mx-auto max-w-[260px]">
      <AnimatePresence mode="wait">
        {phase !== 'post' ? (
          <motion.div
            key="compose"
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
              <img
                src="/img/landing/stopa.jpg"
                alt="stopa"
                className="h-6 w-6 rounded-full object-cover"
              />
              <span className="text-xs font-semibold text-gray-900">stopa</span>
            </div>

            {/* Dropzone / Image */}
            <div className="px-3 pt-2">
              {imageDropped ? (
                <div className="relative overflow-hidden">
                  <img
                    src="/img/landing/dog-post.jpg"
                    alt="Dog"
                    className="w-full object-cover"
                    style={{ aspectRatio: '4/3' }}
                  />
                  {phase === 'uploading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="h-1.5 w-3/4 rounded-full bg-white/30">
                        <div
                          className="h-full rounded-full bg-white transition-all duration-75"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-200 py-10 text-gray-300">
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                    />
                  </svg>
                  <span className="mt-1 text-xs">Drop image here</span>
                </div>
              )}
            </div>

            {/* Caption area */}
            <div className="px-3 py-3">
              <div className="min-h-[20px] text-xs text-gray-800">
                {typedText ? (
                  <span>
                    {typedText}
                    {phase === 'typing' && (
                      <span className="animate-pulse text-gray-400">|</span>
                    )}
                  </span>
                ) : (
                  <span className="text-gray-300">Write a caption...</span>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="post"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative rounded-lg border border-gray-200 bg-white"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2">
              <img
                src="/img/landing/stopa.jpg"
                alt="stopa"
                className="h-7 w-7 rounded-full object-cover"
              />
              <span className="text-xs font-semibold text-gray-900">stopa</span>
            </div>
            {/* Photo */}
            <div className="relative aspect-square w-full overflow-visible">
              <img
                src="/img/landing/dog-post.jpg"
                alt="Dog licking a spoon"
                className="h-full w-full object-cover"
              />
              {/* Heart button — pill, overlapping bottom-right of image */}
              <div
                ref={heartRef}
                className="absolute -right-2 -bottom-3"
                style={{ overflow: 'visible' }}
              >
                <button
                  onClick={handleHeartClick}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xl shadow-sm transition-transform hover:shadow-md active:scale-90"
                >
                  ❤️
                </button>
              </div>
            </div>
            {/* Caption */}
            <div className="px-3 pt-3 pb-2">
              <p className="text-xs text-gray-800">
                <span className="font-semibold">stopa</span>{' '}
                <span className="text-gray-600">Newest member of the team</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag thumbnail following cursor */}
      {showDragThumb && (
        <motion.div
          className="pointer-events-none absolute z-20"
          animate={{ left: cursorPos.x + 12, top: cursorPos.y + 12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <div className="h-10 w-10 overflow-hidden rounded border border-white shadow-lg">
            <img
              src="/img/landing/dog-post.jpg"
              alt="Dog"
              className="h-full w-full object-cover"
            />
          </div>
        </motion.div>
      )}

      {showCursor && (
        <StorageFakeCursor
          x={cursorPos.x}
          y={cursorPos.y}
          clicking={clicking}
        />
      )}
    </div>
  );
}

// ─── Payments Demo ───────────────────────────────────────

type PayTab = 0 | 1 | 2;

const tabLabels = ['One-time', 'Subscription', 'Usage-based'];

function PaymentsDemo() {
  const [activeTab, setActiveTab] = useState<PayTab>(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  useEffect(() => {
    if (!toastVisible) return;
    const t = setTimeout(() => setToastVisible(false), 2000);
    return () => clearTimeout(t);
  }, [toastVisible]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 bg-gray-50 px-4 py-2">
        {tabLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => {
              setActiveTab(i as PayTab);
              setToastVisible(false);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === i
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scene content — grid stacks all tabs so container sizes to the tallest */}
      <div className="relative p-5">
        <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
          {/* One-time */}
          <div
            className={activeTab === 0 ? '' : 'pointer-events-none invisible'}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-full max-w-[200px] rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                <p className="text-sm font-semibold text-gray-800">
                  Pro License
                </p>
                <p className="mt-1 text-2xl font-bold text-blue-600">$49</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  One-time purchase
                </p>
                <button
                  onClick={() => showToast('Payment successful!')}
                  className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 active:scale-[0.97]"
                >
                  Buy Now
                </button>
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div
            className={activeTab === 1 ? '' : 'pointer-events-none invisible'}
          >
            <div className="space-y-3">
              <div className="flex justify-center gap-2">
                {[
                  {
                    name: 'Hobby',
                    price: '$0',
                    border: 'border-gray-200',
                    bg: '',
                    badge: false,
                  },
                  {
                    name: 'Pro',
                    price: '$20',
                    border: 'border-purple-300',
                    bg: 'bg-purple-50',
                    badge: true,
                  },
                  {
                    name: 'Team',
                    price: '$50',
                    border: 'border-gray-200',
                    bg: '',
                    badge: false,
                  },
                ].map((plan) => (
                  <div
                    key={plan.name}
                    className={`relative flex-1 rounded-lg border ${plan.border} ${plan.bg} p-3 text-center`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        Popular
                      </span>
                    )}
                    <p className="text-xs font-semibold text-gray-800">
                      {plan.name}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      {plan.price}
                    </p>
                    <p className="text-[10px] text-gray-500">/mo</p>
                    {plan.name === 'Pro' ? (
                      <button
                        onClick={() => showToast('Subscribed to Pro')}
                        className="mt-2 w-full rounded bg-purple-600 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-purple-700 active:scale-[0.97]"
                      >
                        Subscribe
                      </button>
                    ) : (
                      <button className="mt-2 w-full rounded border border-gray-200 py-1.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50">
                        Select
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Usage-based */}
          <div
            className={activeTab === 2 ? '' : 'pointer-events-none invisible'}
          >
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700">Credits</p>

              <div className="space-y-2.5">
                {[
                  { label: 'GPT-4o', amount: 1200, color: 'rgb(22 163 74)' },
                  { label: 'Claude', amount: 850, color: 'rgb(74 222 128)' },
                  { label: 'Gemini', amount: 430, color: 'rgb(34 197 94)' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between"
                  >
                    <span className="text-[11px] text-gray-600">
                      {item.label}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-700">
                      {item.amount.toLocaleString()} credits
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: '62%',
                    background:
                      'linear-gradient(90deg, rgb(74 222 128) 0%, rgb(22 163 74) 100%)',
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  2,480 / 4,000 credits used
                </span>
              </div>

              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-center">
                <span className="text-xs font-semibold text-green-700">
                  1,520 credits remaining
                </span>
                <span className="text-xs text-green-600"> — $15.20</span>
              </div>
            </div>
          </div>
        </div>

        {/* Toast overlay */}
        <AnimatePresence>
          {toastVisible && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-xs font-medium text-green-700 shadow-sm"
            >
              ✓ {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────

export function BatteriesForAI() {
  return (
    <div className="space-y-16">
      {/* Section header */}
      <AnimateIn>
        <div className="sm:text-center">
          <h2 className="text-2xl font-semibold sm:text-5xl">
            Batteries included
          </h2>
          <p className="mt-6 max-w-3xl text-xl sm:mx-auto">
            Shipping real products mean adding auth, permissions, file storage,
            and payments. Sometimes you want to share cursors, and sometimes you
            want to stream LLM content. Instant comes with these services out of
            the box, and they're designed to work well together.
          </p>
        </div>
      </AnimateIn>

      {/* Features */}
      <div className="grid auto-rows-fr grid-cols-3 gap-6">
        {/* Auth */}
        <AnimateIn className="flex">
          <div className="col-span-1 space-y-4">
            <div>
              <h3 className="text-2xl font-semibold sm:text-3xl">Auth</h3>
              <p className="mt-2 text-lg">
                Use auth to enable your users to sign up for your app. WIth
                Instant you can easily enable sign up via email, Google, Apple,
                GitHub, Clerk, and more.
              </p>
            </div>
            <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
              <AuthDemo />
            </div>
          </div>
        </AnimateIn>

        {/* Permissions */}
        <AnimateIn className="flex">
          <div className="flex flex-col space-y-4">
            <div>
              <h3 className="text-2xl font-semibold sm:text-3xl">
                Permissions
              </h3>
              <p className="mt-2 text-lg">
                Use permissions to control who can access and modify data in
                your app. These rules run on the Instant backend, so they can
                never be bypassed.
              </p>
            </div>
            <div className="grow bg-radial from-white to-[#F7F7F7] px-5 py-12">
              <PermissionsDemo />
            </div>
          </div>
        </AnimateIn>

        {/* Storage */}
        <AnimateIn className="flex">
          <div className="flex flex-col space-y-4">
            <div>
              <h3 className="text-2xl font-semibold sm:text-3xl">Storage</h3>
              <p className="mt-2 text-lg">
                Use storage to allow users to upload images, video, audio, and
                more.
              </p>
            </div>
            <div className="grow bg-radial from-white to-[#EEF2FF] px-5 py-8">
              <StorageDemo />
            </div>
          </div>
        </AnimateIn>

        {/* Payments */}
      </div>
      <AnimateIn>
        <div className="grid grid-cols-3 items-center gap-7">
          <div className="col-span-1">
            <h3 className="text-2xl font-semibold sm:text-3xl">Payments</h3>
            <p className="mt-2 text-lg">
              Build apps that monetize. Easily add one-time purchases,
              subscriptions, or usage-based billing by telling AI to add Stripe
              to your Instant app.
            </p>
          </div>
          <div className="col-span-2">
            <div className="bg-radial from-white to-[#FFF9F4] px-6 py-6">
              <RevenueDashboardDemo />
            </div>
          </div>
        </div>
      </AnimateIn>

      <AnimateIn>
        <div className="grid grid-cols-3 items-center gap-7">
          <div className="col-span-2">
            <div className="bg-radial from-white to-[#F5F0FF] px-6 py-8">
              <LiveStreamDemo />
            </div>
          </div>
          <div className="col-span-1">
            <h3 className="text-2xl font-semibold sm:text-3xl">Presence</h3>
            <p className="mt-2 text-lg">
              Use presence to show who&apos;s online, share cursors, broadcast
              typing indicators, and send reactions. Build collaborative
              experiences where users can feel each other.
            </p>
          </div>
        </div>
      </AnimateIn>

      <AnimateIn>
        <div className="grid grid-cols-3 items-center gap-7">
          <div className="col-span-1">
            <h3 className="text-2xl font-semibold sm:text-3xl">Streams</h3>
            <p className="mt-2 text-lg">
              Use streams to broadcast ephemeral data in real-time. Stream LLM
              responses token-by-token, replay drawings, or push live updates
              — all synced across clients instantly.
            </p>
          </div>
          <div className="col-span-2">
            <div className="bg-radial from-white to-[#FFF9F4] px-6 py-8">
              <StreamsDemoJoin />
            </div>
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}
