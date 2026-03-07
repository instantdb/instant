import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
import { Section } from '@/components/new-landing/Section';
import { Footer } from '@/components/new-landing/Footer';
import { AnimateIn } from '@/components/new-landing/AnimateIn';
import { useRef, useCallback, useState } from 'react';

// ─── Shared ────────────────────────────────────────────

const PEOPLE = {
  drew: { name: 'Drew', img: '/img/landing/drew.jpg' },
  daniel: { name: 'Daniel', img: '/img/landing/daniel.png' },
} as const;

type PersonKey = keyof typeof PEOPLE;

const REACTIONS = [
  '\u2764\uFE0F',
  '\uD83D\uDD25',
  '\uD83C\uDF89',
  '\uD83D\uDC4F',
] as const;

function IPhoneShell({
  owner,
  className,
  children,
}: {
  owner: PersonKey;
  className?: string;
  children: React.ReactNode;
}) {
  const person = PEOPLE[owner];
  return (
    <div className={`flex flex-col items-center ${className ?? ''}`}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <img
          src={person.img}
          alt={person.name}
          className="h-7 w-7 rounded-full object-cover"
        />
        <span className="text-xs font-medium text-gray-600">{person.name}</span>
      </div>
      {/* iPhone shell */}
      <div
        className="relative w-[136px] rounded-[24px] p-[5px] shadow-lg"
        style={{
          background: 'linear-gradient(145deg, #e8e8e8, #d4d4d4)',
          boxShadow:
            '0 4px 12px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.6)',
        }}
      >
        {/* Left buttons: silent switch + volume up/down */}
        <div className="absolute top-[18%] -left-[1.5px] h-[6px] w-[2px] rounded-l-sm bg-gray-300" />
        <div className="absolute top-[28%] -left-[1.5px] h-[12px] w-[2px] rounded-l-sm bg-gray-300" />
        <div className="absolute top-[38%] -left-[1.5px] h-[12px] w-[2px] rounded-l-sm bg-gray-300" />
        {/* Right button: power */}
        <div className="absolute top-[30%] -right-[1.5px] h-[16px] w-[2px] rounded-r-sm bg-gray-300" />
        {/* Screen */}
        <div className="relative overflow-hidden rounded-[19px] bg-white">
          {/* Dynamic Island */}
          <div className="absolute top-[6px] left-1/2 z-10 h-[8px] w-[28px] -translate-x-1/2 rounded-full bg-black" />
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Variant A: Emoji Burst ────────────────────────────

function spawnButtonFloater(
  emoji: string,
  container: HTMLElement,
  p: FloaterParams,
) {
  const el = document.createElement('span');
  el.textContent = emoji;
  el.style.cssText =
    'position:absolute;pointer-events:none;font-size:20px;line-height:1;left:50%;top:50%;margin-left:-10px;margin-top:-10px;z-index:10;';
  container.appendChild(el);

  const anim = el.animate(
    [
      {
        opacity: 0.7,
        transform: 'translateY(0) translateX(0) scale(0.5) rotate(0deg)',
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

function VariantA() {
  const cellRefs = useRef<Record<string, HTMLElement[]>>({});

  const registerCell = useCallback((emoji: string, el: HTMLElement | null) => {
    if (!el) return;
    if (!cellRefs.current[emoji]) cellRefs.current[emoji] = [];
    const arr = cellRefs.current[emoji];
    if (!arr.includes(el)) arr.push(el);
  }, []);

  const react = useCallback((emoji: string) => {
    const cells = cellRefs.current[emoji];
    if (!cells) return;
    const params = randomFloaterParams();
    cells.forEach((cell) => spawnButtonFloater(emoji, cell, params));
  }, []);

  const PhoneScreen = ({ owner }: { owner: PersonKey }) => (
    <IPhoneShell
      owner={owner}
      className={
        owner === 'drew' ? 'translate-y-2 -rotate-3' : '-translate-y-3 rotate-2'
      }
    >
      <div className="grid grid-cols-2 pt-5">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            ref={(el) => registerCell(emoji, el)}
            onClick={() => react(emoji)}
            className="relative flex items-center justify-center overflow-visible py-5 text-2xl transition-transform first:rounded-tl-[19px] last:rounded-br-[19px] hover:bg-gray-50 active:scale-90 [&:nth-child(2)]:rounded-tr-[19px] [&:nth-child(3)]:rounded-bl-[19px]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </IPhoneShell>
  );

  return (
    <div className="flex items-end justify-center gap-10">
      <PhoneScreen owner="drew" />
      <PhoneScreen owner="daniel" />
    </div>
  );
}

// ─── Variant B: Rising Hearts ──────────────────────────

interface FloaterParams {
  startX: number;
  drift1: number;
  drift2: number;
  drift3: number;
  drift4: number;
  rotation: number;
}

function randomFloaterParams(): FloaterParams {
  const startX = 20 + Math.random() * 60; // % from left
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
  el.style.cssText = `position:absolute;pointer-events:none;font-size:20px;line-height:1;bottom:10px;left:${p.startX}%;z-index:10;`;
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

function VariantB() {
  const screenRefs = useRef<HTMLElement[]>([]);

  const registerScreen = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (!screenRefs.current.includes(el)) screenRefs.current.push(el);
  }, []);

  const react = useCallback((emoji: string) => {
    const params = randomFloaterParams();
    screenRefs.current.forEach((s) => spawnFloater(emoji, s, params));
  }, []);

  const PhoneScreen = ({ owner }: { owner: PersonKey }) => (
    <IPhoneShell
      owner={owner}
      className={
        owner === 'drew' ? 'translate-y-2 -rotate-3' : '-translate-y-3 rotate-2'
      }
    >
      <div
        ref={registerScreen}
        className="relative flex min-h-[180px] flex-col justify-between rounded-[19px] pt-5 pb-3"
        style={{
          background:
            'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        }}
      >
        {/* LIVE badge + viewer count */}
        <div className="flex items-center gap-2 px-3">
          <span className="rounded bg-red-500 px-1.5 py-0.5 text-[8px] font-bold text-white">
            LIVE
          </span>
          <span className="text-[8px] text-white/60">1.2k watching</span>
        </div>
        {/* Emoji buttons */}
        <div className="flex justify-center gap-3 px-2">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => react(emoji)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm backdrop-blur-sm transition-transform hover:bg-white/20 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </IPhoneShell>
  );

  return (
    <div className="flex items-end justify-center gap-10">
      <PhoneScreen owner="drew" />
      <PhoneScreen owner="daniel" />
    </div>
  );
}

// ─── Variant C: Reaction Bar ───────────────────────────

const REACTION_COLORS: Record<string, string> = {
  '\u2764\uFE0F': '#ef4444',
  '\uD83D\uDD25': '#f97316',
  '\uD83C\uDF89': '#a855f7',
  '\uD83D\uDC4F': '#eab308',
};

function spawnRing(container: HTMLElement, color: string) {
  const el = document.createElement('span');
  el.style.cssText = `position:absolute;pointer-events:none;left:50%;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;border:2px solid ${color};z-index:10;`;
  container.appendChild(el);

  const anim = el.animate(
    [
      { width: '8px', height: '8px', opacity: 0.8 },
      { width: '50px', height: '50px', opacity: 0 },
    ],
    { duration: 500, easing: 'ease-out', fill: 'forwards' },
  );

  anim.onfinish = () => el.remove();
}

function bounceEmoji(el: HTMLElement) {
  el.animate(
    [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1.5) rotate(-8deg)', offset: 0.3 },
      { transform: 'scale(0.9) rotate(4deg)', offset: 0.65 },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 400, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
}

function VariantC() {
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(REACTIONS.map((e) => [e, 0])),
  );
  // pill refs: emoji -> HTMLElement[] (one per phone)
  const pillRefs = useRef<Record<string, HTMLElement[]>>({});
  // emoji span refs for bounce
  const emojiSpanRefs = useRef<Record<string, HTMLElement[]>>({});

  const registerPill = useCallback((emoji: string, el: HTMLElement | null) => {
    if (!el) return;
    if (!pillRefs.current[emoji]) pillRefs.current[emoji] = [];
    const arr = pillRefs.current[emoji];
    if (!arr.includes(el)) arr.push(el);
  }, []);

  const registerEmojiSpan = useCallback(
    (emoji: string, el: HTMLElement | null) => {
      if (!el) return;
      if (!emojiSpanRefs.current[emoji]) emojiSpanRefs.current[emoji] = [];
      const arr = emojiSpanRefs.current[emoji];
      if (!arr.includes(el)) arr.push(el);
    },
    [],
  );

  const react = useCallback((emoji: string) => {
    setCounts((prev) => ({ ...prev, [emoji]: prev[emoji] + 1 }));
    const color = REACTION_COLORS[emoji] || '#888';
    pillRefs.current[emoji]?.forEach((el) => spawnRing(el, color));
    emojiSpanRefs.current[emoji]?.forEach((el) => bounceEmoji(el));
  }, []);

  const PhoneScreen = ({ owner }: { owner: PersonKey }) => (
    <IPhoneShell
      owner={owner}
      className={
        owner === 'drew' ? 'translate-y-2 -rotate-3' : '-translate-y-3 rotate-2'
      }
    >
      <div className="flex min-h-[180px] flex-col gap-3 rounded-[19px] bg-white px-3 pt-6 pb-3">
        {/* Chat bubble */}
        <div className="flex items-start gap-2">
          <img
            src="/img/landing/drew.jpg"
            alt="Drew"
            className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
          />
          <div className="rounded-xl rounded-tl-sm bg-gray-100 px-2 py-1.5">
            <p className="text-[8px] leading-tight text-gray-800">
              Just shipped v2.0!
            </p>
          </div>
        </div>
        {/* Reaction pills */}
        <div className="mt-auto flex flex-wrap justify-center gap-1.5">
          {REACTIONS.map((emoji) => {
            const count = counts[emoji];
            const color = REACTION_COLORS[emoji] || '#888';
            const active = count > 0;
            return (
              <button
                key={emoji}
                ref={(el) => registerPill(emoji, el)}
                onClick={() => react(emoji)}
                className="relative flex items-center gap-1 rounded-full px-2 py-1 text-[10px] transition-all active:scale-90"
                style={{
                  background: active ? `${color}18` : 'transparent',
                  border: `1.5px solid ${active ? color : '#e5e7eb'}`,
                }}
              >
                <span
                  ref={(el) => registerEmojiSpan(emoji, el)}
                  className="inline-block"
                >
                  {emoji}
                </span>
                {active && (
                  <span className="font-medium" style={{ color }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </IPhoneShell>
  );

  return (
    <div className="flex items-end justify-center gap-10">
      <PhoneScreen owner="drew" />
      <PhoneScreen owner="daniel" />
    </div>
  );
}

// ─── Variant D: Live Stream ─────────────────────────────

import { LiveStreamDemo } from '@/components/new-landing/LiveStreamDemo';

// ─── Page ────────────────────────────────────────────────

export default function ReactionsDemo() {
  return (
    <div className="text-off-black relative">
      <MainNav />
      <Head>
        <title>Reactions Demo | Instant</title>
      </Head>
      <main className="flex-1 pt-16">
        <Section id="batteries-reactions">
          <div className="space-y-16">
            <AnimateIn>
              <div className="sm:text-center">
                <h2 className="text-2xl font-semibold sm:text-5xl">
                  Batteries included
                </h2>
                <p className="mt-12 max-w-2xl text-lg sm:mx-auto">
                  Shipping real products means adding auth, permissions, file
                  storage, and payments. Sometimes you want to share cursors,
                  and sometimes you want to stream LLM content. Instant comes
                  with these services out of the box, and they&apos;re designed
                  to work well together.
                </p>
              </div>
            </AnimateIn>

            {/* Variant A: Emoji Burst */}
            <AnimateIn>
              <div className="grid grid-cols-3 items-center gap-7">
                <div className="col-span-1">
                  <h3 className="text-2xl font-semibold sm:text-3xl">
                    Emoji Burst
                  </h3>
                  <p className="mt-2 text-lg">
                    See who&apos;s online and react in real-time. Use presence
                    to track active users, and topics to broadcast ephemeral
                    events like reactions, cursors, and typing indicators — no
                    extra infrastructure needed.
                  </p>
                </div>
                <div className="col-span-2 rounded-2xl bg-radial from-white to-[#FFF0F5] px-6 py-8">
                  <VariantA />
                </div>
              </div>
            </AnimateIn>

            {/* Variant B: Rising Hearts */}
            <AnimateIn>
              <div className="grid grid-cols-3 items-center gap-7">
                <div className="col-span-1">
                  <h3 className="text-2xl font-semibold sm:text-3xl">
                    Rising Hearts
                  </h3>
                  <p className="mt-2 text-lg">
                    Instagram Live &amp; TikTok-style floating reactions. Emojis
                    drift upward in gentle S-curves, creating a cascade of
                    real-time engagement that syncs across every viewer.
                  </p>
                </div>
                <div className="col-span-2 rounded-2xl bg-radial from-white to-[#FFF5F5] px-6 py-8">
                  <VariantB />
                </div>
              </div>
            </AnimateIn>

            {/* Variant C: Reaction Bar */}
            <AnimateIn>
              <div className="grid grid-cols-3 items-center gap-7">
                <div className="col-span-1">
                  <h3 className="text-2xl font-semibold sm:text-3xl">
                    Reaction Bar
                  </h3>
                  <p className="mt-2 text-lg">
                    Slack &amp; iMessage-style reaction pills with live counts.
                    Each tap increments and pulses — counts stay in sync across
                    every connected device.
                  </p>
                </div>
                <div className="col-span-2 rounded-2xl bg-radial from-white to-[#F0F9FF] px-6 py-8">
                  <VariantC />
                </div>
              </div>
            </AnimateIn>

            {/* Variant D: Live Stream */}
            <AnimateIn>
              <div className="grid grid-cols-3 items-center gap-7">
                <div className="col-span-1">
                  <h3 className="text-2xl font-semibold sm:text-3xl">
                    Live Stream
                  </h3>
                  <p className="mt-2 text-lg">
                    YouTube Live-style floating reactions over a live video
                    stream. Viewers react in real-time and every emoji floats
                    across all connected screens simultaneously.
                  </p>
                </div>
                <div className="col-span-2 rounded-2xl bg-radial from-white to-[#F5F0FF] px-6 py-8">
                  <LiveStreamDemo />
                </div>
              </div>
            </AnimateIn>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
