import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types & config ──────────────────────────────────────

type TxnType = 'one-time' | 'subscription' | 'usage';

interface Transaction {
  id: number;
  customer: string;
  amount: number;
  type: TxnType;
}

const TYPE_CONFIG: Record<
  TxnType,
  { label: string; dotColor: string; bgColor: string; textColor: string }
> = {
  'one-time': {
    label: 'One-time',
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
  },
  subscription: {
    label: 'Subscription',
    dotColor: 'bg-purple-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
  },
  usage: {
    label: 'Usage',
    dotColor: 'bg-green-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
  },
};

const TXN_POOL: Omit<Transaction, 'id'>[] = [
  { customer: 'Alice M.', amount: 49, type: 'one-time' },
  { customer: 'Bob T.', amount: 20, type: 'subscription' },
  { customer: 'Priya K.', amount: 3.47, type: 'usage' },
  { customer: 'James L.', amount: 149, type: 'one-time' },
  { customer: 'Sofia R.', amount: 50, type: 'subscription' },
  { customer: 'Chen W.', amount: 8.92, type: 'usage' },
  { customer: 'Emma D.', amount: 99, type: 'one-time' },
  { customer: 'Liam O.', amount: 20, type: 'subscription' },
  { customer: 'Alice M.', amount: 2.15, type: 'usage' },
  { customer: 'Bob T.', amount: 79, type: 'one-time' },
];

const INTERVAL_MS = 1500;
const MAX_VISIBLE = 5;
const PAUSE_BETWEEN_CYCLES_MS = 2000;

// ─── Animated number hook ────────────────────────────────

function useAnimatedNumber(value: number, duration = 500) {
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
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);

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

// ─── Component ───────────────────────────────────────────

export function LiveTransactionFeedDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [visibleTxns, setVisibleTxns] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);

  const indexRef = useRef(0);
  const idRef = useRef(0);

  const animatedTotal = useAnimatedNumber(total, 500);

  const clear = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const runCycle = useCallback(() => {
    clear();

    // Reset state for a fresh cycle
    indexRef.current = 0;
    idRef.current = 0;
    setVisibleTxns([]);
    setTotal(0);

    const addNext = () => {
      if (indexRef.current >= TXN_POOL.length) {
        // Pause, then restart the cycle
        const pauseTimer = setTimeout(() => {
          runCycle();
        }, PAUSE_BETWEEN_CYCLES_MS);
        timersRef.current.push(pauseTimer);
        return;
      }

      const txn = TXN_POOL[indexRef.current];
      const id = idRef.current++;
      indexRef.current++;

      setVisibleTxns((prev) => {
        const next = [{ ...txn, id }, ...prev];
        return next.slice(0, MAX_VISIBLE);
      });
      setTotal((prev) => prev + txn.amount);

      const timer = setTimeout(addNext, INTERVAL_MS);
      timersRef.current.push(timer);
    };

    // Kick off the first transaction
    addNext();
  }, [clear]);

  // Trigger on scroll-in via IntersectionObserver
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
      className="rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <div className="text-xs font-medium tracking-wide text-gray-400 uppercase">
            Transaction Feed
          </div>
          <div className="mt-0.5 text-2xl font-bold text-gray-800 tabular-nums">
            $
            {animatedTotal.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        {/* Live badge */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Live
        </span>
      </div>

      {/* Transaction list */}
      <div className="overflow-hidden px-4 py-3" style={{ minHeight: 220 }}>
        <AnimatePresence initial={false}>
          {visibleTxns.map((txn) => {
            const config = TYPE_CONFIG[txn.type];

            return (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, x: 40, height: 0, marginBottom: 0 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  height: 'auto',
                  marginBottom: 8,
                }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  {/* Left: dot + customer + type pill */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${config.dotColor}`}
                    />
                    <span className="truncate text-sm font-medium text-gray-700">
                      {txn.customer}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.bgColor} ${config.textColor}`}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Right: amount */}
                  <span className="shrink-0 text-sm font-semibold text-gray-800 tabular-nums">
                    ${txn.amount.toFixed(2)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
