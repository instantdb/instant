import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "motion/react";

// --- Types ---

type Category = "one-time" | "subscription" | "usage";

interface CategoryConfig {
  id: Category;
  label: string;
  subtitle: string;
  dotColor: string;
  barColor: string;
  total: number;
  barValues: number[];
}

const categories: CategoryConfig[] = [
  {
    id: "one-time",
    label: "One-time purchases",
    subtitle: "Licenses & upgrades",
    dotColor: "bg-blue-500",
    barColor: "bg-blue-400",
    total: 1561.0,
    barValues: [49, 99, 29, 79, 149],
  },
  {
    id: "subscription",
    label: "Subscriptions",
    subtitle: "Recurring revenue",
    dotColor: "bg-purple-500",
    barColor: "bg-purple-400",
    total: 1140.0,
    barValues: [100, 120, 140, 100, 120],
  },
  {
    id: "usage",
    label: "Usage metering",
    subtitle: "+$2.47 API calls",
    dotColor: "bg-green-500",
    barColor: "bg-green-400",
    total: 88.92,
    barValues: [8, 12, 5, 10, 7],
  },
];

// --- Animated number hook (counts up once) ---

function useCountUp(target: number, active: boolean, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!active) return;

    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, active, duration]);

  return value;
}

// --- Mini bar chart ---

function MiniBarChart({
  values,
  barColor,
  animate,
}: {
  values: number[];
  barColor: string;
  animate: boolean;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px]">
      {values.map((v, i) => (
        <motion.div
          key={i}
          className={`w-[6px] rounded-sm ${barColor}`}
          initial={{ height: 0 }}
          animate={animate ? { height: Math.max((v / max) * 28, 2) } : {}}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 25,
            delay: i * 0.05,
          }}
        />
      ))}
    </div>
  );
}

// --- Category Row ---

function CategoryRow({
  config,
  animate,
  delay,
}: {
  config: CategoryConfig;
  animate: boolean;
  delay: number;
}) {
  const animatedTotal = useCountUp(config.total, animate);

  return (
    <motion.div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5"
      initial={{ opacity: 0, y: 8 }}
      animate={animate ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay }}
    >
      {/* Dot + label */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div
          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${config.dotColor}`}
        />
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-700">
            {config.label}
          </div>
          <div className="text-[10px] text-gray-400">{config.subtitle}</div>
        </div>
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums text-gray-800">
          ${animatedTotal.toFixed(2)}
        </div>
      </div>

      {/* Mini bar chart */}
      <div className="flex-shrink-0">
        <MiniBarChart
          values={config.barValues}
          barColor={config.barColor}
          animate={animate}
        />
      </div>
    </motion.div>
  );
}

// --- Main Component ---

export function RevenueDashboardDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  const grandTotal = categories.reduce((sum, c) => sum + c.total, 0);
  const animatedGrandTotal = useCountUp(grandTotal, isInView);

  return (
    <div ref={ref} className="rounded-xl bg-white p-5 shadow-sm">
      {/* Header */}
      <motion.div
        className="mb-4 flex items-center justify-between"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.4 }}
      >
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
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] font-medium text-green-600">Live</span>
        </div>
      </motion.div>

      {/* Category rows */}
      <div className="space-y-1">
        {categories.map((config, i) => (
          <CategoryRow
            key={config.id}
            config={config}
            animate={isInView}
            delay={0.15 + i * 0.1}
          />
        ))}
      </div>
    </div>
  );
}
