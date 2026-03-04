import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

// --- Shared hook ---

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
      setDisplay(duration === 400 ? Math.round(current) : current);

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

// --- Shared SVG icons ---

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 8.5L6.5 12L13 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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

// =============================================================
// Idea A: Interactive Credit System
// =============================================================

const creditActions = [
  {
    label: "Generate Image",
    cost: 10,
    color: "bg-purple-500 hover:bg-purple-600",
    result: "Generated a sunset over mountains",
  },
  {
    label: "Summarize",
    cost: 5,
    color: "bg-blue-500 hover:bg-blue-600",
    result: "Summary: 3 key points extracted",
  },
  {
    label: "Translate",
    cost: 3,
    color: "bg-green-600 hover:bg-green-700",
    result: "Translated to Spanish",
  },
];

export function CreditSystemDemo() {
  const [credits, setCredits] = useState(50);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [result, setResult] = useState<{
    label: string;
    text: string;
  } | null>(null);
  const animatedCredits = useAnimatedNumber(credits);

  const handleAction = useCallback(
    (action: (typeof creditActions)[number]) => {
      if (loading || credits < action.cost) return;

      setLoading(true);
      setActiveAction(action.label);
      setResult(null);
      setCredits((c) => c - action.cost);

      setTimeout(() => {
        setLoading(false);
        setActiveAction(null);
        setResult({ label: action.label, text: action.result });
      }, 500);
    },
    [loading, credits],
  );

  const handleReset = useCallback(() => {
    setCredits(50);
    setResult(null);
    setLoading(false);
    setActiveAction(null);
  }, []);

  const isLow = credits <= 10;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Credit Balance
          </div>
          <motion.div
            className={`text-3xl font-bold tabular-nums ${
              isLow ? "text-orange-500" : "text-gray-800"
            }`}
            animate={{ scale: loading ? [1, 1.05, 1] : 1 }}
            transition={{ duration: 0.3 }}
          >
            {animatedCredits}
          </motion.div>
        </div>
        <button
          onClick={handleReset}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 active:scale-[0.98]"
        >
          Reset
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {creditActions.map((action) => {
          const disabled = credits < action.cost || loading;
          return (
            <motion.button
              key={action.label}
              onClick={() => handleAction(action)}
              disabled={disabled}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors active:scale-[0.98] ${
                disabled ? "cursor-not-allowed bg-gray-300" : action.color
              }`}
              whileTap={disabled ? {} : { scale: 0.98 }}
            >
              <div className="text-xs opacity-80">{action.cost} credits</div>
              <div>{action.label}</div>
            </motion.button>
          );
        })}
      </div>

      <div className="min-h-[60px]">
        <AnimatePresence mode="wait">
          {loading && activeAction ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3"
            >
              <motion.div
                className="h-3 w-3 rounded-full bg-blue-400"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              <span className="text-sm font-medium text-gray-500">
                Running {activeAction}…
              </span>
            </motion.div>
          ) : result ? (
            <motion.div
              key={`result-${result.label}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="rounded-lg bg-gray-50 px-4 py-3"
            >
              <div className="mb-1 text-xs font-medium text-gray-400">
                {result.label}
              </div>
              <div className="text-sm font-medium text-gray-700">
                {result.text}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 py-3"
            >
              <span className="text-xs text-gray-400">
                Click an action to use credits
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isLow && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-orange-700">
                  Running low on credits
                </div>
                <div className="text-xs text-orange-500">
                  {credits === 0
                    ? "No credits remaining"
                    : `Only ${credits} credits left`}
                </div>
              </div>
              <button
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-600 active:scale-[0.98]"
                onClick={handleReset}
              >
                Buy more credits
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================
// Idea B: Paywall Unlock
// =============================================================

export function PaywallUnlockDemo() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">
          Premium Insights
        </span>
        <AnimatePresence mode="wait">
          {unlocked ? (
            <motion.div
              key="check"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="text-green-600"
              >
                <path
                  d="M2.5 7.5L5.5 10.5L11.5 3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          ) : (
            <motion.div
              key="lock"
              initial={{ scale: 0, rotate: 90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: -90 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100"
            >
              <svg
                width="12"
                height="14"
                viewBox="0 0 12 14"
                fill="none"
                className="text-gray-500"
              >
                <rect
                  x="1"
                  y="6"
                  width="10"
                  height="7"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M3 6V4C3 2.34315 4.34315 1 6 1C7.65685 1 9 2.34315 9 4V6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative overflow-hidden rounded-lg">
        <div className="space-y-3 bg-gray-50 p-4">
          <div className="flex gap-4">
            <div className="flex-1 rounded-lg bg-white p-3 shadow-sm">
              <p className="text-xs text-gray-400">Revenue</p>
              <p className="text-lg font-semibold text-green-600">+34%</p>
            </div>
            <div className="flex-1 rounded-lg bg-white p-3 shadow-sm">
              <p className="text-xs text-gray-400">Users</p>
              <p className="text-lg font-semibold text-purple-600">12.4k</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">Q4 Analysis</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Growth accelerated in the second half driven by enterprise
              adoption. Retention rates improved 12% after the onboarding
              redesign, and expansion revenue now accounts for 40% of new ARR.
            </p>
          </div>
        </div>

        <AnimatePresence>
          {!unlocked && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <motion.div
                initial={{ backdropFilter: "blur(6px)" }}
                exit={{ backdropFilter: "blur(0px)" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute inset-0 bg-white/60"
              />
              <motion.div
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                <button
                  onClick={() => setUnlocked(true)}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 active:scale-[0.98]"
                >
                  Upgrade to Pro ($9/mo)
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {unlocked && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex justify-end overflow-hidden"
          >
            <button
              onClick={() => setUnlocked(false)}
              className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
            >
              Reset
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================
// Idea C: Live Revenue Feed
// =============================================================

const transactions = [
  { amount: 24.99, email: "sarah@acme.co", plan: "Pro Plan" },
  { amount: 9.99, email: "mike@startup.io", plan: "Starter" },
  { amount: 49.0, email: "team@bigcorp.com", plan: "Team Plan" },
  { amount: 24.99, email: "lisa@dev.sh", plan: "Pro Plan" },
  { amount: 9.99, email: "alex@indie.co", plan: "Starter" },
  { amount: 99.0, email: "ops@enterprise.io", plan: "Enterprise" },
  { amount: 24.99, email: "james@agency.co", plan: "Pro Plan" },
  { amount: 14.99, email: "nina@freelance.me", plan: "Plus" },
];

export function RevenueFeedDemo() {
  const [visibleTxns, setVisibleTxns] = useState<
    { id: number; amount: number; email: string; plan: string }[]
  >([]);
  const [total, setTotal] = useState(0);
  const indexRef = useRef(0);
  const idRef = useRef(0);

  const animatedTotal = useAnimatedNumber(total, 600);

  const addTransaction = useCallback(() => {
    const txn = transactions[indexRef.current % transactions.length];
    indexRef.current += 1;
    const id = idRef.current++;

    setVisibleTxns((prev) => {
      const next = [{ ...txn, id }, ...prev];
      return next.slice(0, 5);
    });
    setTotal((prev) => prev + txn.amount);
  }, []);

  useEffect(() => {
    addTransaction();
    const interval = setInterval(addTransaction, 2000);
    return () => clearInterval(interval);
  }, [addTransaction]);

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Revenue
        </div>
        <div className="mt-1 text-3xl font-bold text-emerald-600">
          ${animatedTotal.toFixed(2)}
        </div>
      </div>
      <div className="overflow-hidden">
        <AnimatePresence initial={false}>
          {visibleTxns.map((txn) => (
            <motion.div
              key={txn.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-sm font-semibold text-emerald-600">
                  ${txn.amount.toFixed(2)}
                </span>
                <span className="truncate text-sm text-gray-500">
                  {txn.email}
                </span>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {txn.plan}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================
// Idea D: Feature Gates Toggle
// =============================================================

type Feature = {
  name: string;
  proOnly: boolean;
};

const features: Feature[] = [
  { name: "Unlimited projects", proOnly: false },
  { name: "Real-time sync", proOnly: false },
  { name: "Custom permissions", proOnly: true },
  { name: "File storage", proOnly: true },
  { name: "Priority support", proOnly: true },
];

export function FeatureGatesDemo() {
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const isPro = plan === "pro";

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-5 flex justify-center">
        <div className="relative flex rounded-full bg-gray-100 p-0.5">
          {(["free", "pro"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setPlan(option)}
              className="relative z-10 px-5 py-1.5 text-sm font-medium capitalize transition-colors"
              style={{
                color: plan === option ? "#fff" : "#6b7280",
              }}
            >
              {option === "free" ? "Free" : "Pro"}
              {plan === option && (
                <motion.div
                  layoutId="toggle-indicator"
                  className={`absolute inset-0 rounded-full ${
                    option === "pro" ? "bg-blue-500" : "bg-gray-500"
                  }`}
                  style={{ zIndex: -1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {features.map((feature) => {
          const locked = feature.proOnly && !isPro;

          return (
            <motion.div
              key={feature.name}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              animate={{ opacity: locked ? 0.6 : 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                <AnimatePresence mode="wait" initial={false}>
                  {locked ? (
                    <motion.span
                      key="lock"
                      className="text-gray-400"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 25,
                      }}
                    >
                      <LockIcon />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="check"
                      className={
                        feature.proOnly ? "text-blue-500" : "text-green-500"
                      }
                      initial={
                        feature.proOnly ? { scale: 0.5, opacity: 0 } : false
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 25,
                      }}
                    >
                      <CheckIcon />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <motion.span
                className="text-sm font-medium"
                animate={{ color: locked ? "#9ca3af" : "#374151" }}
                transition={{ duration: 0.25 }}
              >
                {feature.name}
              </motion.span>

              {feature.proOnly && (
                <motion.span
                  className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium"
                  animate={{
                    backgroundColor: isPro ? "#dbeafe" : "#f3f4f6",
                    color: isPro ? "#3b82f6" : "#9ca3af",
                  }}
                  transition={{ duration: 0.25 }}
                >
                  Pro
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
