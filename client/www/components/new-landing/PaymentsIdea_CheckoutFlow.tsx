import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Scenarios ──────────────────────────────────────────

const SCENARIOS = [
  { name: 'Alice', email: 'alice@acme.co', plan: 'Pro', amount: 49 },
  { name: 'Bob', email: 'bob@startup.io', plan: 'Team', amount: 99 },
  { name: 'Priya', email: 'priya@dev.co', plan: 'Enterprise', amount: 249 },
];

// ─── Animated number hook ───────────────────────────────

function useAnimatedNumber(value: number, duration = 400) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>();
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(Math.round(current));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return display;
}

// ─── Fake cursor ────────────────────────────────────────

function FakeCursor({
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

// ─── Main component ─────────────────────────────────────

type Phase =
  | 'idle'
  | 'typing'
  | 'move-to-button'
  | 'clicking'
  | 'loading'
  | 'success'
  | 'pausing';

export function CheckoutFlowDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scenarioIndex = useRef(0);
  const isVisible = useRef(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [typedEmail, setTypedEmail] = useState('');
  const [cursorPos, setCursorPos] = useState({ x: 140, y: 100 });
  const [clicking, setClicking] = useState(false);
  const [showCursor, setShowCursor] = useState(false);
  const [revenue, setRevenue] = useState(0);

  const animatedRevenue = useAnimatedNumber(revenue, 600);

  const sched = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  }, []);

  const clearAllTimeouts = useCallback(() => {
    for (const t of timeouts.current) clearTimeout(t);
    timeouts.current = [];
  }, []);

  const runCycle = useCallback(() => {
    const s = SCENARIOS[scenarioIndex.current % SCENARIOS.length];
    scenarioIndex.current += 1;

    setScenario(s);
    setTypedEmail('');
    setPhase('idle');
    setClicking(false);
    setShowCursor(false);

    // Small delay before starting
    sched(() => {
      setShowCursor(true);
      // Move cursor to email field area
      setCursorPos({ x: 160, y: 128 });
      setPhase('typing');

      // Type email character by character
      const chars = s.email.split('');
      chars.forEach((_, i) => {
        sched(() => {
          setTypedEmail(s.email.slice(0, i + 1));
        }, 400 + i * 60);
      });

      const typingDone = 400 + chars.length * 60 + 200;

      // Move cursor to Pay button
      sched(() => {
        setPhase('move-to-button');
        setCursorPos({ x: 140, y: 238 });
      }, typingDone);

      // Click the button
      sched(() => {
        setPhase('clicking');
        setClicking(true);
      }, typingDone + 400);

      sched(() => {
        setClicking(false);
      }, typingDone + 550);

      // Loading state
      sched(() => {
        setPhase('loading');
        setShowCursor(false);
      }, typingDone + 600);

      // Success
      sched(() => {
        setPhase('success');
        setRevenue((prev) => prev + s.amount);
      }, typingDone + 1100);

      // Pause, then cycle
      sched(() => {
        setPhase('pausing');
      }, typingDone + 3100);

      sched(() => {
        if (isVisible.current) {
          runCycle();
        }
      }, typingDone + 3600);
    }, 300);
  }, [sched]);

  // IntersectionObserver to start/stop autoplay
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible.current) {
          isVisible.current = true;
          runCycle();
        } else if (!entry.isIntersecting && isVisible.current) {
          isVisible.current = false;
          clearAllTimeouts();
          setPhase('idle');
          setShowCursor(false);
          setTypedEmail('');
          scenarioIndex.current = 0;
          setRevenue(0);
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearAllTimeouts();
    };
  }, [runCycle, clearAllTimeouts]);

  const isForm =
    phase !== 'success' && phase !== 'pausing';

  return (
    <div ref={containerRef} className="relative flex flex-col items-center">
      {/* Revenue counter */}
      <div className="mb-3 flex w-full max-w-[280px] items-center justify-end gap-1.5">
        <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
          Revenue
        </span>
        <motion.span
          className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-600"
          animate={{ scale: revenue > 0 ? [1, 1.08, 1] : 1 }}
          transition={{ duration: 0.3 }}
          key={revenue}
        >
          ${animatedRevenue}
        </motion.span>
      </div>

      {/* Card */}
      <div className="relative w-full max-w-[280px]">
        <AnimatePresence mode="wait">
          {isForm ? (
            <motion.div
              key={`form-${scenario.name}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              {/* Plan header */}
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-400">
                    Subscribe to
                  </div>
                  <div className="text-sm font-semibold text-gray-800">
                    {scenario.plan} Plan
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-800">
                    ${scenario.amount}
                  </div>
                  <div className="text-[10px] text-gray-400">/month</div>
                </div>
              </div>

              {/* Divider */}
              <div className="mb-4 border-t border-gray-100" />

              {/* Email field */}
              <div className="mb-3">
                <label className="mb-1 block text-[10px] font-medium text-gray-500">
                  Email
                </label>
                <div className="flex h-8 items-center rounded-lg border border-gray-200 bg-gray-50 px-3">
                  <span className="text-xs text-gray-700">{typedEmail}</span>
                  {phase === 'typing' && (
                    <span className="ml-px inline-block h-3 w-0.5 animate-pulse bg-gray-800" />
                  )}
                  {!typedEmail && phase !== 'typing' && (
                    <span className="text-xs text-gray-300">
                      you@example.com
                    </span>
                  )}
                </div>
              </div>

              {/* Card field */}
              <div className="mb-4">
                <label className="mb-1 block text-[10px] font-medium text-gray-500">
                  Card
                </label>
                <div className="flex h-8 items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3">
                  <span className="text-xs text-gray-700">
                    &bull;&bull;&bull;&bull; 4242
                  </span>
                  <span className="text-[10px] text-gray-300">12/28</span>
                </div>
              </div>

              {/* Pay button */}
              <motion.div
                className={`flex h-9 items-center justify-center rounded-lg text-sm font-medium text-white ${
                  phase === 'loading'
                    ? 'bg-blue-400'
                    : phase === 'clicking'
                      ? 'bg-blue-700'
                      : 'bg-blue-600'
                }`}
                animate={{
                  scale: phase === 'clicking' ? 0.97 : 1,
                }}
                transition={{ duration: 0.1 }}
              >
                {phase === 'loading' ? (
                  <motion.div
                    className="h-4 w-4 rounded-full border-2 border-white border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                ) : (
                  <span>Pay ${scenario.amount}</span>
                )}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key={`success-${scenario.name}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.3,
                type: 'spring',
                stiffness: 300,
                damping: 25,
              }}
              className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-5 py-8 shadow-sm"
            >
              {/* Green checkmark */}
              <motion.div
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 20,
                  delay: 0.1,
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-emerald-600"
                >
                  <path
                    d="M5 13L10 18L20 6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>

              <motion.div
                className="mb-1 text-sm font-semibold text-gray-800"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Payment successful!
              </motion.div>

              <motion.div
                className="mb-3 text-xs text-gray-400"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {scenario.plan} Plan &mdash; ${scenario.amount}/mo
              </motion.div>

              <motion.div
                className="text-[10px] text-gray-300"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {scenario.email}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fake cursor overlay */}
        {showCursor && (
          <FakeCursor x={cursorPos.x} y={cursorPos.y} clicking={clicking} />
        )}
      </div>
    </div>
  );
}
