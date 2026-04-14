'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import exampleDB from '@/lib/intern/docs-feedback/db';

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;

function SlidePreview({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-8">
      <div style={{ width: SLIDE_W, height: SLIDE_H }} className="shrink-0">
        {children}
      </div>
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: THUMB_W,
          height: SLIDE_H * THUMB_SCALE,
        }}
      >
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Auth Demo (from BatteriesForAI) ────────────────────

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

function AuthCard() {
  const [view, setView] = useState<'form' | 'verify' | 'success'>('form');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [typedCode, setTypedCode] = useState('');
  const [avatarSrc, setAvatarSrc] = useState('');
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => timeoutsRef.current.forEach(clearTimeout);
  }, []);

  const sched = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeoutsRef.current.push(t);
  };

  const preloadAvatar = useCallback(
    (name: string) =>
      fetch(`/api/avatar?name=${encodeURIComponent(name)}&size=48`)
        .then((r) => r.blob())
        .then((blob) => setAvatarSrc(URL.createObjectURL(blob)))
        .catch(() =>
          setAvatarSrc(`/api/avatar?name=${encodeURIComponent(name)}&size=48`),
        ),
    [],
  );

  const handleSendCode = () => {
    const derived = email.includes('@')
      ? email.split('@')[0].charAt(0).toUpperCase() +
        email.split('@')[0].slice(1)
      : 'Friend';
    setName(derived);
    setTypedCode('');
    setView('verify');

    const avatarReady = preloadAvatar(derived);
    const code = '424242';
    let t = 400;
    for (let i = 1; i <= code.length; i++) {
      const text = code.slice(0, i);
      sched(() => setTypedCode(text), t + i * 80);
    }
    t += code.length * 80 + 600;
    sched(() => avatarReady.then(() => setView('success')), t);
  };

  const handleSocial = (provider: string) => {
    setName(provider);
    preloadAvatar(provider).then(() => setView('success'));
  };

  return (
    <div className="w-[240px]">
      <AnimatePresence mode="wait">
        {view === 'form' ? (
          <motion.div
            key="form"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl bg-white p-5 shadow-sm"
          >
            <p className="mb-3 text-sm font-semibold text-gray-800">Sign in</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
              placeholder="you@example.com"
              data-lpignore="true"
              data-1p-ignore
              data-bwignore
              data-form-type="other"
              autoComplete="one-time-code"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:ring-1 focus:ring-orange-200 focus:outline-none"
            />
            <button
              onClick={handleSendCode}
              className="mt-3 w-full rounded-lg bg-orange-500 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 active:scale-[0.98]"
            >
              Send Code
            </button>
            <div className="my-3 flex items-center -space-x-1">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
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
        ) : view === 'verify' ? (
          <motion.div
            key="verify"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl bg-white p-5 shadow-sm"
          >
            <p className="mb-1 text-sm font-semibold text-gray-800">
              Check your email
            </p>
            <p className="mb-4 text-xs text-gray-500">
              We sent a code to{' '}
              <span className="font-medium text-gray-700">{email}</span>
            </p>
            <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-gray-700">
              {typedCode ? (
                <span>
                  {typedCode}
                  <span className="animate-pulse text-gray-400">|</span>
                </span>
              ) : (
                <span className="text-gray-400">------</span>
              )}
            </div>
            <div className="mt-3 w-full rounded-lg bg-orange-500 py-2 text-center text-sm font-medium text-white">
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
            className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 shadow-sm"
          >
            <img
              src={avatarSrc}
              alt={name}
              className="h-12 w-12 rounded-full"
            />
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Storage Card (PhotoApp from storage page) ──────────

function animateHeart(target: HTMLElement) {
  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.innerText = '\u2764\uFE0F';
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
}

const storageRoom = exampleDB.room('slide2StorageDemo', 'storage');

function StorageCard() {
  const heartRef = useRef<HTMLDivElement>(null);

  const publishHeart = exampleDB.rooms.usePublishTopic(storageRoom, 'hearts');
  exampleDB.rooms.useTopicEffect(storageRoom, 'hearts', () => {
    if (heartRef.current) animateHeart(heartRef.current);
  });

  const handleHeartClick = () => {
    publishHeart({});
    if (heartRef.current) animateHeart(heartRef.current);
  };

  return (
    <div className="w-[240px] rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 rounded-t-lg px-3 py-2">
        <img
          src="/img/landing/stopa.jpg"
          alt=""
          className="h-7 w-7 rounded-full object-cover"
        />
      </div>
      <div className="relative aspect-square w-full">
        <img
          src="/img/landing/dog-post.jpg"
          alt="Dog licking a spoon"
          className="h-full w-full rounded-b-lg object-cover"
        />
        <div
          ref={heartRef}
          className="absolute -right-2 -bottom-3"
          style={{ overflow: 'visible' }}
        >
          <button
            onClick={handleHeartClick}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xl shadow-sm transition-transform hover:shadow-md active:scale-90"
          >
            {'\u2764\uFE0F'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Presence Card (single StreamCard with auto-hearts) ─

const REACTIONS = [
  '\u2764\uFE0F',
  '\uD83D\uDD25',
  '\uD83C\uDF89',
  '\uD83D\uDC4F',
] as const;
type Reaction = (typeof REACTIONS)[number];

interface FloaterParams {
  startX: number;
  drift1: number;
  drift2: number;
  drift3: number;
  drift4: number;
  rotation: number;
}

function randomFloaterParams(): FloaterParams {
  const startX = 20 + Math.random() * 60;
  const driftRange = 18;
  return {
    startX,
    drift1: (Math.random() - 0.5) * driftRange,
    drift2: (Math.random() - 0.5) * driftRange,
    drift3: (Math.random() - 0.5) * driftRange,
    drift4: (Math.random() - 0.5) * driftRange,
    rotation: (Math.random() - 0.5) * 40,
  };
}

function spawnFloater(emoji: string, container: HTMLElement, p: FloaterParams) {
  const el = document.createElement('span');
  el.textContent = emoji;
  el.style.cssText = `position:absolute;pointer-events:none;font-size:20px;line-height:1;bottom:10px;left:${p.startX}%;margin-left:-0.5em;z-index:10;`;
  container.appendChild(el);

  const anim = el.animate(
    [
      {
        opacity: 0.7,
        transform: `translateY(0) translateX(0) scale(0.5) rotate(0deg)`,
      },
      {
        opacity: 1,
        transform: `translateY(-30px) translateX(${p.drift1}px) scale(1.1) rotate(${p.rotation * 0.3}deg)`,
        offset: 0.2,
      },
      {
        opacity: 1,
        transform: `translateY(-70px) translateX(${p.drift2}px) scale(1) rotate(${-p.rotation * 0.5}deg)`,
        offset: 0.45,
      },
      {
        opacity: 0.8,
        transform: `translateY(-110px) translateX(${p.drift3}px) scale(0.95) rotate(${p.rotation * 0.4}deg)`,
        offset: 0.7,
      },
      {
        opacity: 0,
        transform: `translateY(-150px) translateX(${p.drift4}px) scale(0.7) rotate(${-p.rotation}deg)`,
      },
    ],
    { duration: 1800, easing: 'ease-out', fill: 'forwards' },
  );

  anim.onfinish = () => el.remove();
}

// Button centers: ❤️ ~15%, 🔥 ~38%, 🎉 ~62%, 👏 ~85%
const frozenEmojis = [
  // ❤️ trail — rising from left (~15%)
  {
    emoji: '\u2764\uFE0F',
    bottom: '12%',
    left: '15%',
    scale: 1.1,
    rotate: -3,
    opacity: 1,
  },
  {
    emoji: '\u2764\uFE0F',
    bottom: '35%',
    left: '13%',
    scale: 1.0,
    rotate: 5,
    opacity: 0.9,
  },
  {
    emoji: '\u2764\uFE0F',
    bottom: '58%',
    left: '17%',
    scale: 0.85,
    rotate: -8,
    opacity: 0.65,
  },
  // 🔥 trail — rising from center-left (~38%)
  {
    emoji: '\uD83D\uDD25',
    bottom: '15%',
    left: '38%',
    scale: 1.05,
    rotate: 4,
    opacity: 1,
  },
  {
    emoji: '\uD83D\uDD25',
    bottom: '40%',
    left: '36%',
    scale: 0.95,
    rotate: -6,
    opacity: 0.85,
  },
  // 🎉 trail — rising from center-right (~62%)
  {
    emoji: '\uD83C\uDF89',
    bottom: '12%',
    left: '62%',
    scale: 1.1,
    rotate: 3,
    opacity: 1,
  },
  {
    emoji: '\uD83C\uDF89',
    bottom: '32%',
    left: '60%',
    scale: 1.0,
    rotate: -6,
    opacity: 0.9,
  },
  {
    emoji: '\uD83C\uDF89',
    bottom: '55%',
    left: '64%',
    scale: 0.9,
    rotate: 8,
    opacity: 0.7,
  },
  // 👏 trail — rising from right (~85%)
  {
    emoji: '\uD83D\uDC4F',
    bottom: '18%',
    left: '78%',
    scale: 1.0,
    rotate: -5,
    opacity: 0.7,
  },
];

function PresenceCard() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 2;
    const onSeeked = () => v.pause();
    v.addEventListener('seeked', onSeeked, { once: true });
    return () => v.removeEventListener('seeked', onSeeked);
  }, []);

  return (
    <div className="relative mb-6">
      <div className="w-[240px] overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-3 py-2">
          <div className="flex items-center gap-2 text-gray-300">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15 12 12 15 15"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9 12 12 15 9"
              />
            </svg>
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
              />
            </svg>
          </div>
          <span className="ml-auto rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
            LIVE
          </span>
        </div>
        <div className="relative aspect-video overflow-hidden bg-gray-900">
          <video
            ref={videoRef}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            src="/img/landing/stream-clip.mp4"
          />
          {frozenEmojis.map((f, i) => (
            <span
              key={i}
              className="pointer-events-none absolute z-10"
              style={{
                bottom: f.bottom,
                left: f.left,
                fontSize: 20,
                lineHeight: 1,
                transform: `scale(${f.scale}) rotate(${f.rotate}deg)`,
                opacity: f.opacity,
              }}
            >
              {f.emoji}
            </span>
          ))}
          <div className="absolute right-0 bottom-0 left-0 z-10">
            <div className="h-[3px] w-full bg-black/20">
              <div className="h-full w-full bg-red-500" />
            </div>
          </div>
        </div>
      </div>
      {/* Emoji buttons floating below the card */}
      <div className="absolute -bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
        {REACTIONS.map((emoji) => (
          <span
            key={emoji}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-base shadow-md"
          >
            {emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Streams Card (two synced canvases with a sun drawing) ─

function SunDrawing({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      stroke="#F97316"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="50" cy="50" r="18" />
      <line x1="50" y1="24" x2="50" y2="14" />
      <line x1="50" y1="76" x2="50" y2="86" />
      <line x1="24" y1="50" x2="14" y2="50" />
      <line x1="76" y1="50" x2="86" y2="50" />
      <line x1="31.6" y1="31.6" x2="24.5" y2="24.5" />
      <line x1="68.4" y1="68.4" x2="75.5" y2="75.5" />
      <line x1="31.6" y1="68.4" x2="24.5" y2="75.5" />
      <line x1="68.4" y1="31.6" x2="75.5" y2="24.5" />
    </svg>
  );
}

function StreamsCanvas({ name, avatar }: { name: string; avatar: string }) {
  const dotRows = [];
  for (let y = 12; y < 80; y += 10) {
    for (let x = 12; x < 110; x += 10) {
      dotRows.push(
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.7" fill="#e5e7eb" />,
      );
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center -space-x-1 px-1">
        <img
          src={avatar}
          alt={name}
          className="h-5 w-5 rounded-full object-cover"
        />
        <span className="text-xs font-medium">{name}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="relative" style={{ width: 110, height: 82 }}>
          <svg viewBox="0 0 110 82" className="absolute inset-0 h-full w-full">
            {dotRows}
          </svg>
          <SunDrawing className="absolute inset-1.5 h-[70px] w-[98px]" />
        </div>
      </div>
    </div>
  );
}

function StreamsCard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stopaRef = useRef<HTMLDivElement>(null);
  const drewRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const stopa = stopaRef.current;
    const drew = drewRef.current;
    if (!container || !stopa || !drew) return;

    const cRect = container.getBoundingClientRect();
    const sRect = stopa.getBoundingClientRect();
    const dRect = drew.getBoundingClientRect();

    // Right edge center of Stopa's canvas
    const x1 = sRect.right - cRect.left + 4;
    const y1 = sRect.top + sRect.height / 2 - cRect.top;
    // Left edge center of Drew's canvas
    const x2 = dRect.left - cRect.left - 4;
    const y2 = dRect.top + dRect.height / 2 - cRect.top;

    // Line centered in the gap, 60% of gap length, gentle slope
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const halfLen = (x2 - x1) * 0.45;
    const slope = 0.3; // gentle downward angle
    setLine({
      x1: mx - halfLen,
      y1: my - halfLen * slope,
      x2: mx + halfLen,
      y2: my + halfLen * slope,
    });
  }, []);

  return (
    <div ref={containerRef} className="relative w-[260px]">
      <div className="flex items-start gap-7">
        <div ref={stopaRef}>
          <StreamsCanvas name="Stopa" avatar="/img/landing/stopa.jpg" />
        </div>
        <div className="translate-y-4" ref={drewRef}>
          <StreamsCanvas name="Drew" avatar="/img/landing/drew.jpg" />
        </div>
      </div>
      {line && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="pellet-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F97316" stopOpacity="0" />
              <stop offset="20%" stopColor="#F97316" stopOpacity="0.9" />
              <stop offset="80%" stopColor="#F97316" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="url(#pellet-fade)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

// ─── Slide 2 ────────────────────────────────────────────

function Slide2() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Radial spotlight glow */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '30%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center px-16 pt-14">
        {/* Title */}
        <h2 className="text-center text-[56px] leading-[1.15] font-normal tracking-tight">
          Everything you need to
          <br />
          <span className="text-orange-600">ship great apps</span>
        </h2>

        {/* Cards row */}
        <div
          className="mt-14 flex items-start justify-center gap-1"
          style={{ transform: 'scale(1.15)', transformOrigin: 'top center' }}
        >
          <div className="flex translate-y-4 -rotate-3 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Auth</span>
            <AuthCard />
          </div>
          <div className="flex translate-y-8 rotate-1 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Storage</span>
            <StorageCard />
          </div>
          <div className="flex translate-y-2 -rotate-1 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Presence</span>
            <PresenceCard />
          </div>
          <div className="flex translate-y-6 rotate-2 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Streams</span>
            <StreamsCard />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Streams Card V2 (AI chat with streaming tokens) ────

function RobotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      {/* Antenna */}
      <line
        x1="12"
        y1="2.5"
        x2="12"
        y2="5"
        stroke="#94A3B8"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="1.8" r="1.2" fill="#60A5FA" />
      {/* Head */}
      <rect x="4" y="5" width="16" height="14" rx="3" fill="#60A5FA" />
      {/* Face plate */}
      <rect x="6.5" y="7.5" width="11" height="9" rx="2" fill="white" />
      {/* Eyes */}
      <circle cx="9.5" cy="11" r="1.3" fill="#3B82F6" />
      <circle cx="14.5" cy="11" r="1.3" fill="#3B82F6" />
      {/* Smile */}
      <path
        d="M9.5 14.2c.7.8 1.6 1.2 2.5 1.2s1.8-.4 2.5-1.2"
        stroke="#3B82F6"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function StreamsChatCard() {
  const visible = 'Thanks to Instant streams, as fast as';
  const fading = ' my to';

  return (
    <div className="flex w-[210px] flex-col overflow-hidden rounded-[20px] border border-gray-200 bg-white pb-3 shadow-xs">
      {/* Dynamic island */}
      <div className="flex justify-center pt-2 pb-0">
        <div className="h-[5px] w-[40px] rounded-full bg-gray-300" />
      </div>
      {/* Chat messages */}
      <div className="flex flex-col gap-3 px-3 py-3">
        {/* User message — right aligned */}
        <div className="flex items-start justify-end gap-2">
          <div className="rounded-lg rounded-tr-none bg-orange-50 px-2.5 py-1.5 text-sm text-gray-700">
            How fast can you respond?
          </div>
          <img
            src="/img/landing/drew.jpg"
            alt="Drew"
            className="mt-0.5 h-5 w-5 shrink-0 rounded-full object-cover"
          />
        </div>

        {/* AI response — left aligned, tokens arriving */}
        <div className="flex items-start gap-2">
          <RobotIcon className="mt-0.5 h-7 w-7 shrink-0" />
          <div className="rounded-lg rounded-tl-none bg-gray-100 px-2.5 py-1.5 text-sm leading-relaxed text-gray-700">
            <span>{visible}</span>
            <span className="text-gray-700/40">{fading}</span>
            <span className="inline-block h-3.5 w-[2px] translate-y-[2px] bg-green-500" />
          </div>
        </div>
      </div>

      {/* Message input */}
      <div className="mt-auto px-3 pb-1">
        <div className="flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
          <span className="flex-1" />
          <svg
            className="h-4 w-4 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2 Variation 2 ────────────────────────────────

export function Slide2V2() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '30%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center px-16 pt-14">
        <h2 className="text-center text-[56px] leading-[1.15] font-normal tracking-tight">
          Everything you need to
          <br />
          <span className="text-orange-600">ship great apps</span>
        </h2>

        <div
          className="mt-14 flex items-start justify-center gap-1"
          style={{ transform: 'scale(1.15)', transformOrigin: 'top center' }}
        >
          <div className="flex translate-y-12 -rotate-3 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Auth</span>
            <AuthCard />
          </div>
          <div className="flex translate-y-2 rotate-1 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Storage</span>
            <StorageCard />
          </div>
          <div className="flex translate-y-14 -rotate-1 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Presence</span>
            <PresenceCard />
          </div>
          <div className="flex translate-y-5 rotate-2 flex-col items-center gap-7">
            <span className="text-3xl font-normal text-gray-900">Streams</span>
            <StreamsChatCard />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Slide2Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">Slide 2</h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">Variation 1</p>
        <SlidePreview>
          <Slide2 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">Variation 2</p>
        <SlidePreview>
          <Slide2V2 />
        </SlidePreview>
      </div>
    </div>
  );
}
