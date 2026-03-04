import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---

type Category = "one-time" | "subscription" | "usage";

interface Transaction {
  id: number;
  category: Category;
  amount: number;
  label: string;
}

interface CategoryConfig {
  id: Category;
  label: string;
  dotColor: string;
  barColor: string;
  highlightBg: string;
  textColor: string;
}

const categories: CategoryConfig[] = [
  {
    id: "one-time",
    label: "One-time purchases",
    dotColor: "bg-blue-500",
    barColor: "bg-blue-400",
    highlightBg: "bg-blue-50",
    textColor: "text-blue-600",
  },
  {
    id: "subscription",
    label: "Subscriptions",
    dotColor: "bg-purple-500",
    barColor: "bg-purple-400",
    highlightBg: "bg-purple-50",
    textColor: "text-purple-600",
  },
  {
    id: "usage",
    label: "Usage metering",
    dotColor: "bg-green-500",
    barColor: "bg-green-400",
    highlightBg: "bg-green-50",
    textColor: "text-green-600",
  },
];

const transactionTemplates: Record<
  Category,
  { amounts: number[]; labels: string[] }
> = {
  "one-time": {
    amounts: [49, 99, 29, 79, 149],
    labels: [
      "License sold",
      "Pro upgrade",
      "Starter pack",
      "Team license",
      "Enterprise key",
    ],
  },
  subscription: {
    amounts: [20, 50, 35, 20, 100],
    labels: [
      "Monthly plan",
      "Team plan",
      "Pro renewal",
      "Starter plan",
      "Enterprise plan",
    ],
  },
  usage: {
    amounts: [2.47, 8.12, 0.94, 15.3, 4.68],
    labels: [
      "API calls",
      "Compute units",
      "Storage sync",
      "Batch queries",
      "Data transfer",
    ],
  },
};

// --- Animated number hook ---

function useAnimatedNumber(target: number, duration = 600) {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number>();
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    prevRef.current = target;

    if (from === to) return;

    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

// --- Mini bar chart ---

function MiniBarChart({
  values,
  barColor,
}: {
  values: number[];
  barColor: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px]">
      {values.map((v, i) => (
        <motion.div
          key={i}
          className={`w-[6px] rounded-sm ${barColor}`}
          initial={{ height: 0 }}
          animate={{ height: Math.max((v / max) * 28, 2) }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        />
      ))}
    </div>
  );
}

// --- Category Row ---

function CategoryRow({
  config,
  total,
  barValues,
  highlighted,
  lastTx,
}: {
  config: CategoryConfig;
  total: number;
  barValues: number[];
  highlighted: boolean;
  lastTx: Transaction | null;
}) {
  const animatedTotal = useAnimatedNumber(total);

  return (
    <motion.div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        highlighted ? config.highlightBg : "bg-transparent"
      }`}
      animate={{
        backgroundColor: highlighted ? undefined : "rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.5 }}
    >
      {/* Dot + label */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <motion.div
          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${config.dotColor}`}
          animate={
            highlighted
              ? { scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }
              : { scale: 1, opacity: 1 }
          }
          transition={highlighted ? { duration: 0.6 } : { duration: 0.3 }}
        />
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-700">
            {config.label}
          </div>
          <AnimatePresence mode="wait">
            {lastTx && highlighted ? (
              <motion.div
                key={lastTx.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-[10px] font-medium ${config.textColor}`}
              >
                +${lastTx.amount.toFixed(2)} {lastTx.label}
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-gray-400"
              >
                {config.id === "one-time"
                  ? "Licenses & upgrades"
                  : config.id === "subscription"
                    ? "Recurring revenue"
                    : "Pay-per-use billing"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 text-right">
        <motion.div
          className="text-sm font-semibold tabular-nums text-gray-800"
          key={total}
        >
          ${animatedTotal.toFixed(2)}
        </motion.div>
      </div>

      {/* Mini bar chart */}
      <div className="flex-shrink-0">
        <MiniBarChart values={barValues} barColor={config.barColor} />
      </div>
    </motion.div>
  );
}

// --- Main Component ---

export function RevenueDashboardDemo() {
  const [totals, setTotals] = useState<Record<Category, number>>({
    "one-time": 347,
    subscription: 580,
    usage: 42.15,
  });
  const [barData, setBarData] = useState<Record<Category, number[]>>({
    "one-time": [49, 99, 29, 79, 49],
    subscription: [100, 120, 140, 100, 120],
    usage: [8, 12, 5, 10, 7],
  });
  const [highlighted, setHighlighted] = useState<Category | null>(null);
  const [lastTx, setLastTx] = useState<Record<Category, Transaction | null>>({
    "one-time": null,
    subscription: null,
    usage: null,
  });
  const txIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const addTransaction = useCallback(() => {
    const catIndex = Math.floor(Math.random() * 3);
    const cat = categories[catIndex].id;
    const templates = transactionTemplates[cat];
    const tplIndex = Math.floor(Math.random() * templates.amounts.length);
    const amount = templates.amounts[tplIndex];
    const label = templates.labels[tplIndex];

    const tx: Transaction = {
      id: txIdRef.current++,
      category: cat,
      amount,
      label,
    };

    setTotals((prev) => ({ ...prev, [cat]: prev[cat] + amount }));
    setBarData((prev) => ({
      ...prev,
      [cat]: [...prev[cat].slice(1), amount],
    }));
    setLastTx((prev) => ({ ...prev, [cat]: tx }));
    setHighlighted(cat);

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlighted(null);
    }, 1500);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(addTransaction, 2000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [addTransaction]);

  const grandTotal = totals["one-time"] + totals.subscription + totals.usage;
  const animatedGrandTotal = useAnimatedNumber(grandTotal);

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Revenue Dashboard
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-bold tabular-nums text-gray-800">
              ${animatedGrandTotal.toFixed(2)}
            </span>
            <span className="text-[10px] text-gray-400">total revenue</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1">
          <motion.div
            className="h-1.5 w-1.5 rounded-full bg-green-500"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-[10px] font-medium text-green-600">Live</span>
        </div>
      </div>

      {/* Category rows */}
      <div className="space-y-1">
        {categories.map((config) => (
          <CategoryRow
            key={config.id}
            config={config}
            total={totals[config.id]}
            barValues={barData[config.id]}
            highlighted={highlighted === config.id}
            lastTx={lastTx[config.id]}
          />
        ))}
      </div>
    </div>
  );
}
