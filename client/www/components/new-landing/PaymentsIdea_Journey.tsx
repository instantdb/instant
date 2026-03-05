import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type StepStatus = 'locked' | 'ready' | 'playing' | 'done';

type Step = {
  id: number;
  label: string;
  sublabel: string;
  color: string; // tailwind color name: blue, purple, green
  bgActive: string;
  bgDone: string;
  textColor: string;
  ringColor: string;
  price: string;
  description: string;
  resultLines: string[];
};

const steps: Step[] = [
  {
    id: 0,
    label: 'One-time',
    sublabel: 'License',
    color: 'blue',
    bgActive: 'bg-blue-500',
    bgDone: 'bg-blue-500',
    textColor: 'text-blue-600',
    ringColor: 'ring-blue-500',
    price: '$49',
    description: 'Purchase app license',
    resultLines: [
      'Payment received — $49.00',
      'License key generated',
      'Access granted',
    ],
  },
  {
    id: 1,
    label: 'Subscription',
    sublabel: 'Monthly',
    color: 'purple',
    bgActive: 'bg-purple-500',
    bgDone: 'bg-purple-500',
    textColor: 'text-purple-600',
    ringColor: 'ring-purple-500',
    price: '$20/mo',
    description: 'Upgrade to Pro plan',
    resultLines: [
      'Subscription started — $20/mo',
      'Next billing: Apr 4, 2026',
      'Pro features unlocked',
    ],
  },
  {
    id: 2,
    label: 'Usage-based',
    sublabel: 'API credits',
    color: 'green',
    bgActive: 'bg-green-500',
    bgDone: 'bg-green-500',
    textColor: 'text-green-600',
    ringColor: 'ring-green-500',
    price: '$0.01/req',
    description: 'Burn API credits',
    resultLines: [
      '247 requests processed',
      'Charged $2.47 to balance',
      'Usage synced in real-time',
    ],
  },
];

// --- Animated number hook (reused pattern from codebase) ---

function useAnimatedCounter(
  target: number,
  isActive: boolean,
  duration = 1200,
) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!isActive) {
      setValue(0);
      return;
    }

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
  }, [isActive, target, duration]);

  return value;
}

// --- Icons ---

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 8.5L6.5 12L13 4"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <rect
      x="3"
      y="7"
      width="10"
      height="7"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M5 7V5C5 3.34315 6.34315 2 8 2C9.65685 2 11 3.34315 11 5V7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const PlayIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 1L10.5 6L2.5 11V1Z" fill="currentColor" />
  </svg>
);

// --- Step Result Panel ---

function StepResultPanel({
  step,
  lineIndex,
}: {
  step: Step;
  lineIndex: number;
}) {
  const requestCount = useAnimatedCounter(247, step.id === 2 && lineIndex >= 0);

  return (
    <div className="space-y-1.5">
      {step.resultLines.map((line, i) => {
        const visible = i <= lineIndex;
        const displayLine =
          step.id === 2 && i === 0
            ? `${requestCount} requests processed`
            : line;

        return (
          <AnimatePresence key={i}>
            {visible && (
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 25,
                }}
                className="flex items-center gap-2"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 20,
                    delay: 0.05,
                  }}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    i === lineIndex
                      ? step.bgActive + ' text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i < lineIndex ? (
                    <CheckIcon />
                  ) : (
                    <motion.div
                      className="h-1.5 w-1.5 rounded-full bg-current"
                      animate={
                        i === lineIndex
                          ? { scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }
                          : {}
                      }
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                  )}
                </motion.div>
                <span className="text-xs text-gray-600">{displayLine}</span>
              </motion.div>
            )}
          </AnimatePresence>
        );
      })}
    </div>
  );
}

// --- Main Component ---

export function CustomerJourneyDemo() {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [playingLineIndex, setPlayingLineIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const getStepStatus = useCallback(
    (stepId: number): StepStatus => {
      if (activeStep === stepId) return 'playing';
      if (completedSteps.has(stepId)) return 'done';
      if (stepId === 0) return 'ready';
      if (completedSteps.has(stepId - 1)) return 'ready';
      return 'locked';
    },
    [activeStep, completedSteps],
  );

  const playStep = useCallback(
    (stepId: number) => {
      const status = getStepStatus(stepId);
      if (status === 'locked' || status === 'playing') return;

      // Clear any existing timers
      if (timerRef.current) clearTimeout(timerRef.current);

      setActiveStep(stepId);
      setPlayingLineIndex(-1);

      // Reveal lines one by one
      const step = steps[stepId];
      step.resultLines.forEach((_, i) => {
        setTimeout(
          () => {
            setPlayingLineIndex(i);
          },
          400 + i * 500,
        );
      });

      // Mark complete after all lines shown
      const totalTime = 400 + step.resultLines.length * 500 + 300;
      timerRef.current = setTimeout(() => {
        setCompletedSteps((prev) => new Set([...prev, stepId]));
        setActiveStep(null);
        setPlayingLineIndex(-1);
      }, totalTime);
    },
    [getStepStatus],
  );

  const handleReset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCompletedSteps(new Set());
    setActiveStep(null);
    setPlayingLineIndex(-1);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const allDone = completedSteps.size === steps.length && activeStep === null;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium tracking-wide text-gray-400 uppercase">
            Customer Journey
          </div>
          <div className="mt-0.5 text-sm font-semibold text-gray-800">
            3 payment models, 1 user
          </div>
        </div>
        <button
          onClick={handleReset}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 active:scale-[0.98]"
        >
          Reset
        </button>
      </div>

      {/* Timeline */}
      <div className="mb-5 flex items-center justify-between px-2">
        {steps.map((step, i) => {
          const status = getStepStatus(step.id);
          const isClickable = status === 'ready' || status === 'done';

          return (
            <React.Fragment key={step.id}>
              {/* Connecting line before this node (except first) */}
              {i > 0 && (
                <div className="relative mx-1 h-0.5 flex-1">
                  <div className="absolute inset-0 rounded-full bg-gray-200" />
                  <motion.div
                    className={`absolute inset-y-0 left-0 rounded-full ${steps[i - 1].bgDone}`}
                    initial={{ width: '0%' }}
                    animate={{
                      width:
                        completedSteps.has(i - 1) ||
                        activeStep === i ||
                        completedSteps.has(i)
                          ? '100%'
                          : '0%',
                    }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              )}

              {/* Step node */}
              <div className="flex flex-col items-center">
                <motion.button
                  onClick={() => playStep(step.id)}
                  disabled={!isClickable}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                    status === 'playing'
                      ? `border-current ${step.textColor} bg-white`
                      : status === 'done'
                        ? `${step.bgDone} border-transparent text-white`
                        : status === 'ready'
                          ? `border-gray-300 bg-white text-gray-500 hover:border-gray-400`
                          : `border-gray-200 bg-gray-50 text-gray-300`
                  }`}
                  whileHover={isClickable ? { scale: 1.08 } : {}}
                  whileTap={isClickable ? { scale: 0.95 } : {}}
                >
                  <AnimatePresence mode="wait">
                    {status === 'done' ? (
                      <motion.span
                        key="check"
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 20,
                        }}
                      >
                        <CheckIcon />
                      </motion.span>
                    ) : status === 'playing' ? (
                      <motion.span
                        key="playing"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 20,
                        }}
                      >
                        <motion.div
                          className={`h-2.5 w-2.5 rounded-full ${step.bgActive}`}
                          animate={{
                            scale: [1, 1.4, 1],
                            opacity: [0.6, 1, 0.6],
                          }}
                          transition={{ duration: 1, repeat: Infinity }}
                        />
                      </motion.span>
                    ) : status === 'locked' ? (
                      <motion.span
                        key="lock"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <LockIcon />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="play"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <PlayIcon />
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Pulse ring when playing */}
                  {status === 'playing' && (
                    <motion.div
                      className={`absolute inset-0 rounded-full border-2 ${
                        step.color === 'blue'
                          ? 'border-blue-400'
                          : step.color === 'purple'
                            ? 'border-purple-400'
                            : 'border-green-400'
                      }`}
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  )}
                </motion.button>

                {/* Label */}
                <motion.div
                  className="mt-2 text-center"
                  animate={{
                    opacity: status === 'locked' ? 0.4 : 1,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className={`text-xs font-semibold ${
                      status === 'done' || status === 'playing'
                        ? step.textColor
                        : 'text-gray-600'
                    }`}
                  >
                    {step.label}
                  </div>
                  <div className="text-[10px] text-gray-400">{step.price}</div>
                </motion.div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Result panel */}
      <div className="min-h-[88px]">
        <AnimatePresence mode="wait">
          {activeStep !== null ? (
            <motion.div
              key={`playing-${activeStep}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`rounded-lg border px-4 py-3 ${
                steps[activeStep].color === 'blue'
                  ? 'border-blue-100 bg-blue-50'
                  : steps[activeStep].color === 'purple'
                    ? 'border-purple-100 bg-purple-50'
                    : 'border-green-100 bg-green-50'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <motion.div
                  className={`h-1.5 w-1.5 rounded-full ${steps[activeStep].bgActive}`}
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
                <span
                  className={`text-xs font-semibold ${steps[activeStep].textColor}`}
                >
                  {steps[activeStep].description}
                </span>
              </div>
              <StepResultPanel
                step={steps[activeStep]}
                lineIndex={playingLineIndex}
              />
            </motion.div>
          ) : allDone ? (
            <motion.div
              key="all-done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="flex flex-col items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 15,
                  delay: 0.1,
                }}
                className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <CheckIcon />
              </motion.div>
              <span className="text-xs font-semibold text-emerald-700">
                Journey complete
              </span>
              <span className="text-[10px] text-emerald-500">
                All 3 payment models handled
              </span>
            </motion.div>
          ) : completedSteps.size > 0 ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 py-3"
            >
              <span className="text-xs text-gray-400">
                Click the next step to continue the journey
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 py-3"
            >
              <span className="text-xs text-gray-400">
                Click the first step to start the customer journey
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
