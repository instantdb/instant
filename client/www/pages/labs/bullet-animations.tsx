import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

const BULLETS = ["Database", "Auth", "Storage", "Permissions", "Streams"];

// ─── Animation 1: Simple Fade ───────────────────────────────────────────────
function SimpleFade({ trigger }: { trigger: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {BULLETS.map((b, i) => (
        <span
          key={b}
          className="transition-opacity duration-700 ease-out"
          style={{
            opacity: trigger ? 1 : 0,
            transitionDelay: `${i * 200}ms`,
          }}
        >
          {b}
        </span>
      ))}
    </div>
  );
}

// ─── Animation 2: Slide Up + Fade ───────────────────────────────────────────
function SlideUpFade({ trigger }: { trigger: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {BULLETS.map((b, i) => (
        <span
          key={b}
          className="transition-all duration-700 ease-out"
          style={{
            opacity: trigger ? 1 : 0,
            transform: trigger ? "translateY(0)" : "translateY(24px)",
            transitionDelay: `${i * 150}ms`,
          }}
        >
          {b}
        </span>
      ))}
    </div>
  );
}

// ─── Animation 3: Slide In From Right ───────────────────────────────────────
function SlideFromRight({ trigger }: { trigger: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {BULLETS.map((b, i) => (
        <span
          key={b}
          className="transition-all duration-600 ease-out"
          style={{
            opacity: trigger ? 1 : 0,
            transform: trigger ? "translateX(0)" : "translateX(60px)",
            transitionDelay: `${i * 120}ms`,
          }}
        >
          {b}
        </span>
      ))}
    </div>
  );
}

// ─── Animation 4: Scale Pop ─────────────────────────────────────────────────
function ScalePop({ trigger }: { trigger: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {BULLETS.map((b, i) => (
        <span
          key={b}
          className="transition-all duration-500"
          style={{
            opacity: trigger ? 1 : 0,
            transform: trigger ? "scale(1)" : "scale(0.6)",
            transitionDelay: `${i * 150}ms`,
            transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {b}
        </span>
      ))}
    </div>
  );
}

// ─── Animation 5: Typewriter / Clip Reveal ──────────────────────────────────
function ClipReveal({ trigger }: { trigger: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {BULLETS.map((b, i) => {
        const delay = i * 200;
        return (
          <span
            key={b}
            className="overflow-hidden inline-block transition-all duration-700 ease-out"
            style={{
              opacity: trigger ? 1 : 0,
              clipPath: trigger
                ? "inset(0 0% 0 0)"
                : "inset(0 100% 0 0)",
              transitionDelay: `${delay}ms`,
            }}
          >
            {b}
          </span>
        );
      })}
    </div>
  );
}

const ANIMATIONS = [
  {
    name: "1. Simple Fade",
    description:
      "Each bullet fades in sequentially. Subtle and clean.",
    Component: SimpleFade,
  },
  {
    name: "2. Slide Up + Fade",
    description:
      "Each bullet slides up from below while fading in. Adds a sense of arrival.",
    Component: SlideUpFade,
  },
  {
    name: "3. Slide From Right",
    description:
      "Bullets slide in from the right side, matching the text position in the frame.",
    Component: SlideFromRight,
  },
  {
    name: "4. Scale Pop",
    description:
      "Bullets pop in with a slight overshoot scale. Punchy and attention-grabbing.",
    Component: ScalePop,
  },
  {
    name: "5. Clip Reveal",
    description:
      "Text is revealed left-to-right like a curtain. Feels editorial and polished.",
    Component: ClipReveal,
  },
];

export default function BulletAnimationsPage() {
  const [triggers, setTriggers] = useState<boolean[]>(
    ANIMATIONS.map(() => false)
  );

  const replay = useCallback((index: number) => {
    setTriggers((prev) => {
      const next = [...prev];
      next[index] = false;
      return next;
    });
    setTimeout(() => {
      setTriggers((prev) => {
        const next = [...prev];
        next[index] = true;
        return next;
      });
    }, 50);
  }, []);

  const replayAll = useCallback(() => {
    setTriggers(ANIMATIONS.map(() => false));
    setTimeout(() => {
      setTriggers(ANIMATIONS.map(() => true));
    }, 50);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setTriggers(ANIMATIONS.map(() => true));
    }, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Head>
        <title>Bullet Animation Options</title>
      </Head>
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-10">
            <h1 className="text-2xl font-bold">
              Bullet Animation Options
            </h1>
            <button
              onClick={replayAll}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-sm transition-colors"
            >
              Replay All
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {ANIMATIONS.map((anim, i) => (
              <div
                key={anim.name}
                className="border border-white/10 rounded-xl overflow-hidden"
              >
                {/* Preview area simulating the video frame */}
                <div
                  className="relative bg-[#3a3530] flex items-center justify-end pr-16"
                  style={{ aspectRatio: "16/9" }}
                >
                  {/* Dark overlay to simulate the video look */}
                  <div className="absolute inset-0 bg-black/30" />
                  <div
                    className="relative z-10 text-white font-semibold leading-tight"
                    style={{
                      fontFamily: "Switzer, system-ui, sans-serif",
                      fontSize: "clamp(24px, 3.5vw, 62px)",
                    }}
                  >
                    <anim.Component trigger={triggers[i]} />
                  </div>
                </div>
                {/* Label area */}
                <div className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{anim.name}</h2>
                    <p className="text-white/60 text-sm mt-1">
                      {anim.description}
                    </p>
                  </div>
                  <button
                    onClick={() => replay(i)}
                    className="shrink-0 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-sm transition-colors"
                  >
                    Replay
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
