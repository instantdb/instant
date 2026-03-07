import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Step data ────────────────────────────────────────────

const STEPS = [
  {
    id: 'signup',
    label: 'Signup',
    detail: 'Free trial',
    color: 'bg-blue-500',
    textColor: 'text-blue-500',
    ringColor: 'ring-blue-300',
  },
  {
    id: 'charge',
    label: 'First Charge',
    detail: '$20/mo',
    color: 'bg-green-500',
    textColor: 'text-green-500',
    ringColor: 'ring-green-300',
  },
  {
    id: 'renewal',
    label: 'Renewal',
    detail: '$20/mo',
    color: 'bg-purple-500',
    textColor: 'text-purple-500',
    ringColor: 'ring-purple-300',
  },
  {
    id: 'upgrade',
    label: 'Upgrade',
    detail: '$50/mo',
    color: 'bg-orange-500',
    textColor: 'text-orange-500',
    ringColor: 'ring-orange-300',
  },
  {
    id: 'revenue',
    label: 'Total Revenue',
    detail: '$140',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-500',
    ringColor: 'ring-emerald-300',
  },
];

const STEP_DELAY_MS = 1200;
const PAUSE_AFTER_COMPLETE_MS = 3000;

// ─── Icons (heroicons style, 24x24, strokeWidth 1.5) ─────

function UserIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      <path d="M4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 6v12" />
      <path d="M15.5 9.5c0-1.38-1.567-2.5-3.5-2.5S8.5 8.12 8.5 9.5 10.067 12 12 12s3.5 1.12 3.5 2.5-1.567 2.5-3.5 2.5-3.5-1.12-3.5-2.5" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16.023 9.348h4.992v-4.992" />
      <path d="M2.985 19.644a9 9 0 0 1-.63-8.572 9 9 0 0 1 6.69-5.278 9 9 0 0 1 7.978 2.554l4.992 4.992" />
      <path d="M7.977 14.652H2.985v4.992" />
      <path d="M21.015 4.356a9 9 0 0 1 .63 8.572 9 9 0 0 1-6.69 5.278 9 9 0 0 1-7.978-2.554l-4.992-4.992" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19.5V4.5" />
      <path d="M5.25 11.25 12 4.5l6.75 6.75" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M7 16v-3" />
      <path d="M11 16V9" />
      <path d="M15 16v-5" />
      <path d="M19 16V7" />
    </svg>
  );
}

const STEP_ICONS = [UserIcon, DollarIcon, RefreshIcon, ArrowUpIcon, ChartIcon];

// ─── Rolling digit component ─────────────────────────────

function RollingDigit({ value }: { value: string }) {
  return (
    <span className="inline-block overflow-hidden" style={{ height: '1.2em' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ─── Rolling price display for renewal step ──────────────

function RollingPrice({ active }: { active: boolean }) {
  const digits = ['$', '2', '0', '/', 'm', 'o'];
  const rollSequence = [
    ['$', '2', '0', '/', 'm', 'o'],
    ['$', '1', '5', '/', 'm', 'o'],
    ['$', '3', '8', '/', 'm', 'o'],
    ['$', '2', '0', '/', 'm', 'o'],
  ];
  const [seqIndex, setSeqIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeqIndex(0);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i >= rollSequence.length) {
        clearInterval(interval);
        return;
      }
      setSeqIndex(i);
    }, 200);
    return () => clearInterval(interval);
  }, [active]);

  const current = rollSequence[seqIndex] || digits;

  return (
    <span className="inline-flex">
      {current.map((char, i) => (
        <RollingDigit key={i} value={char} />
      ))}
    </span>
  );
}

// ─── Count-up display for revenue step ───────────────────

function CountUpDisplay({ active }: { active: boolean }) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    const duration = 1000;
    const target = 140;
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  return <span className="tabular-nums">${value}</span>;
}

// ─── Upgrade price display ───────────────────────────────

function UpgradePrice({ active }: { active: boolean }) {
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowNew(false);
      return;
    }
    const timer = setTimeout(() => setShowNew(true), 400);
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <span className="inline-flex items-center gap-1">
      <motion.span
        className="text-gray-400"
        animate={showNew ? { textDecoration: 'line-through' } : {}}
      >
        $20
      </motion.span>
      <AnimatePresence>
        {showNew && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="font-semibold text-orange-600"
          >
            {'\u2192'} $50/mo
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Step detail renderer ────────────────────────────────

function StepDetail({
  stepIndex,
  active,
}: {
  stepIndex: number;
  active: boolean;
}) {
  if (stepIndex === 2 && active) {
    return <RollingPrice active={active} />;
  }
  if (stepIndex === 3 && active) {
    return <UpgradePrice active={active} />;
  }
  if (stepIndex === 4 && active) {
    return <CountUpDisplay active={active} />;
  }
  return <span>{STEPS[stepIndex].detail}</span>;
}

// ─── Main component ──────────────────────────────────────

export function SubscriptionLifecycleDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  }, []);

  const runCycle = useCallback(() => {
    clear();
    setActiveStepIndex(-1);
    setIsPlaying(true);

    STEPS.forEach((_, i) => {
      sched(() => {
        setActiveStepIndex(i);
      }, i * STEP_DELAY_MS);
    });

    // After all steps, pause then restart
    const totalTime = STEPS.length * STEP_DELAY_MS + PAUSE_AFTER_COMPLETE_MS;
    sched(() => {
      setActiveStepIndex(-1);
      setIsPlaying(false);
      // Short gap before restarting
      sched(() => {
        runCycle();
      }, 300);
    }, totalTime);
  }, [clear, sched]);

  // IntersectionObserver to trigger autoplay
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
    <div
      ref={containerRef}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium tracking-wide text-gray-400 uppercase">
            Subscription Lifecycle
          </div>
          <div className="mt-0.5 text-sm font-semibold text-gray-800">
            Watch the journey unfold
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-600">
          <span className="relative flex h-1.5 w-1.5">
            {isPlaying && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            )}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
          </span>
          Auto-playing
        </span>
      </div>

      {/* Timeline */}
      <div className="flex items-start justify-between px-1">
        {STEPS.map((step, i) => {
          const isActive = i <= activeStepIndex;
          const isCurrent = i === activeStepIndex;
          const lineActive = i <= activeStepIndex;
          const Icon = STEP_ICONS[i];

          return (
            <div key={step.id} className="flex flex-1 flex-col items-center">
              {/* Top row: line + dot */}
              <div className="flex w-full items-center">
                {/* Left connecting line */}
                {i > 0 && (
                  <div className="relative h-0.5 flex-1">
                    <div className="absolute inset-0 rounded-full bg-gray-200" />
                    <motion.div
                      className={`absolute inset-y-0 left-0 rounded-full ${STEPS[i - 1].color}`}
                      initial={{ width: '0%' }}
                      animate={{ width: lineActive ? '100%' : '0%' }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                )}

                {/* Dot */}
                <div className="relative flex-shrink-0">
                  <motion.div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                      isActive
                        ? `${step.color} border-transparent text-white`
                        : 'border-gray-200 bg-white text-gray-400'
                    }`}
                    animate={isCurrent ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                    transition={
                      isCurrent
                        ? {
                            duration: 0.6,
                            repeat: Infinity,
                            repeatType: 'loop',
                          }
                        : { duration: 0.3 }
                    }
                  >
                    <Icon />
                  </motion.div>

                  {/* Pulse ring on current step */}
                  {isCurrent && (
                    <motion.div
                      className={`absolute inset-0 rounded-full ${step.ringColor}`}
                      style={{ border: '2px solid currentColor' }}
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  )}
                </div>

                {/* Right connecting line */}
                {i < STEPS.length - 1 && (
                  <div className="relative h-0.5 flex-1">
                    <div className="absolute inset-0 rounded-full bg-gray-200" />
                    {/* This line fills when the NEXT step activates */}
                  </div>
                )}
              </div>

              {/* Label below dot */}
              <motion.div
                className="mt-2 text-center"
                initial={{ opacity: 0.4 }}
                animate={{ opacity: isActive ? 1 : 0.4 }}
                transition={{ duration: 0.3 }}
              >
                <div
                  className={`text-[10px] font-semibold ${
                    isActive ? step.textColor : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </div>
                <div
                  className={`mt-0.5 text-[10px] ${
                    isActive ? 'text-gray-600' : 'text-gray-300'
                  }`}
                >
                  <StepDetail stepIndex={i} active={isCurrent} />
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
