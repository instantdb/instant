import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// --- Data ---

type Tier = 'Pro' | 'Team';

interface Customer {
  id: number;
  name: string;
  tier: Tier;
  amount: number;
  cumMrr: number;
}

const tierColor: Record<Tier, string> = {
  Pro: 'bg-purple-500',
  Team: 'bg-blue-500',
};

const tierText: Record<Tier, string> = {
  Pro: 'text-purple-700 bg-purple-50',
  Team: 'text-blue-700 bg-blue-50',
};

const revenueScript: {
  delay: number;
  name: string;
  tier: Tier;
  amount: number;
}[] = [
  { delay: 3800, name: 'Alice M.', tier: 'Pro', amount: 20 },
  { delay: 5000, name: 'Bob T.', tier: 'Team', amount: 50 },
  { delay: 6000, name: 'Priya K.', tier: 'Pro', amount: 20 },
  { delay: 6800, name: 'James L.', tier: 'Pro', amount: 20 },
  { delay: 7400, name: 'Sofia R.', tier: 'Team', amount: 50 },
  { delay: 7900, name: 'Chen W.', tier: 'Pro', amount: 20 },
  { delay: 8300, name: 'Emma D.', tier: 'Pro', amount: 20 },
  { delay: 8600, name: 'Liam O.', tier: 'Team', amount: 50 },
  { delay: 8850, name: 'Ava S.', tier: 'Pro', amount: 20 },
  { delay: 9050, name: 'Noah P.', tier: 'Pro', amount: 20 },
];

const tweetText = 'We launched!';

// --- Fake Cursor ---

function FakeCursor({
  x,
  y,
  clicking,
  visible,
}: {
  x: number;
  y: number;
  clicking: boolean;
  visible: boolean;
}) {
  if (!visible) return null;
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

// --- Rolling Price ---

function RollingPrice({ value }: { value: number }) {
  const formatted = `$${value.toLocaleString()}`;
  const chars = formatted.split('');
  const len = chars.length;

  return (
    <span className="inline-flex items-baseline tabular-nums">
      {chars.map((ch, i) => {
        const posFromRight = len - 1 - i;
        if (ch === '$' || ch === ',') {
          return (
            <span key={`static-${posFromRight}`} className="inline-block">
              {ch}
            </span>
          );
        }
        return (
          <span
            key={`pos-${posFromRight}`}
            className="relative inline-block overflow-hidden"
            style={{ width: '0.62em', height: '1.1em' }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ch + '-' + posFromRight + '-' + value}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
                className="absolute inset-0 flex items-center justify-center"
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

// --- Sparkline ---

function Sparkline({ values, max }: { values: number[]; max: number }) {
  return (
    <div className="flex items-end gap-[3px]">
      {Array.from({ length: 10 }, (_, i) => {
        const v = values[i];
        const h = v != null ? Math.max((v / max) * 24, 2) : 0;
        return (
          <motion.div
            key={i}
            className="w-[5px] rounded-sm bg-orange-400"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: h, opacity: v != null ? 1 : 0.15 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
            }}
          />
        );
      })}
    </div>
  );
}

// --- Float Amount ---

interface FloatEntry {
  id: number;
  amount: number;
}

function FloatAmounts({ floats }: { floats: FloatEntry[] }) {
  return (
    <div className="pointer-events-none relative h-0">
      <AnimatePresence>
        {floats.map((f) => (
          <motion.span
            key={f.id}
            className="absolute left-0 text-sm font-semibold text-green-500"
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -20, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            +${f.amount}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

// --- Phase types ---

type Phase = 'compose' | 'posted' | 'revenue';

// --- Main Component ---

const MAX_VISIBLE = 5;

export function LaunchDayDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const idCounter = useRef(0);

  const [phase, setPhase] = useState<Phase>('compose');
  const [typedText, setTypedText] = useState('');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [clicking, setClicking] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mrr, setMrr] = useState(0);
  const [sparkData, setSparkData] = useState<number[]>([]);
  const [floats, setFloats] = useState<FloatEntry[]>([]);

  const clear = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const sched = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  const runCycle = useCallback(() => {
    clear();
    setPhase('compose');
    setTypedText('');
    setShowCursor(false);
    setClicking(false);
    setCustomers([]);
    setMrr(0);
    setSparkData([]);
    setFloats([]);

    let t = 0;

    // Phase 1: Compose & Post
    // Cursor appears
    sched(() => {
      setShowCursor(true);
      setCursorPos({ x: 200, y: 10 });
    }, t);

    t += 300;

    // Cursor moves to textarea
    sched(() => setCursorPos({ x: 60, y: 48 }), t);

    t += 300;

    // Click into textarea
    sched(() => setClicking(true), t);
    t += 150;
    sched(() => setClicking(false), t);

    t += 150;

    // Type "We launched!" char by char
    for (let i = 0; i <= tweetText.length; i++) {
      const text = tweetText.slice(0, i);
      sched(() => setTypedText(text), t + i * 50);
    }
    t += tweetText.length * 50 + 200;

    // Cursor moves to Post button
    sched(() => setCursorPos({ x: 210, y: 88 }), t);

    t += 500;

    // Click Post
    sched(() => setClicking(true), t);
    t += 200;
    sched(() => {
      setClicking(false);
      setPhase('posted');
      setShowCursor(false);
    }, t);

    t += 500;

    // Phase 2: Product appears — transition to revenue phase
    sched(() => setPhase('revenue'), t);

    // Phase 3: Revenue rolls in
    let cumMrr = 0;
    revenueScript.forEach((entry) => {
      sched(() => {
        cumMrr += entry.amount;
        const customer: Customer = {
          id: ++idCounter.current,
          name: entry.name,
          tier: entry.tier,
          amount: entry.amount,
          cumMrr,
        };

        setCustomers((prev) => [customer, ...prev]);
        setMrr(cumMrr);
        setSparkData((prev) => [...prev, cumMrr]);

        const floatId = idCounter.current;
        setFloats((prev) => [...prev, { id: floatId, amount: entry.amount }]);
        setTimeout(() => {
          setFloats((prev) => prev.filter((f) => f.id !== floatId));
        }, 900);
      }, entry.delay);
    });

    // Phase 4: Hold & loop
    const lastDelay = revenueScript[revenueScript.length - 1].delay;
    sched(() => runCycle(), lastDelay + 3000);
  }, [clear, sched]);

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

  const visible = customers.slice(0, MAX_VISIBLE);
  const moreCount = Math.max(0, customers.length - MAX_VISIBLE);

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl bg-white p-5 shadow-sm"
    >
      <FakeCursor
        x={cursorPos.x}
        y={cursorPos.y}
        clicking={clicking}
        visible={showCursor}
      />

      <AnimatePresence mode="wait">
        {phase === 'compose' ? (
          <motion.div
            key="compose"
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            {/* Tweet compose box */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-[10px] font-bold text-white">
                  Y
                </div>
                <span className="text-xs font-semibold text-gray-900">
                  @yourapp
                </span>
              </div>
              <div className="px-3 py-3">
                <div className="min-h-[24px] text-sm text-gray-800">
                  {typedText ? (
                    <span>
                      {typedText}
                      <span className="animate-pulse text-gray-400">|</span>
                    </span>
                  ) : (
                    <span className="text-gray-300">
                      What&apos;s happening?
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-end border-t border-gray-100 px-3 py-2">
                <div className="rounded-full bg-blue-500 px-4 py-1 text-xs font-semibold text-white">
                  Post
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="revenue"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Compact posted bar */}
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">
                &#10003;
              </div>
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">yourapp</span>
                {': '}
                <span className="text-gray-600">&ldquo;{tweetText}&rdquo;</span>
              </span>
            </div>

            <AnimatePresence>
              {phase === 'revenue' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* MRR header */}
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                      Monthly Recurring Revenue
                    </span>
                    <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                      <span className="text-[10px] font-medium text-green-600">
                        Live
                      </span>
                    </div>
                  </div>

                  {/* MRR value + float + sparkline */}
                  <div className="mb-1 flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-gray-900">
                      <RollingPrice value={mrr} />
                    </span>
                    <FloatAmounts floats={floats} />
                  </div>

                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {customers.length} customer
                      {customers.length !== 1 ? 's' : ''}
                    </span>
                    <Sparkline values={sparkData} max={300} />
                  </div>

                  {/* Divider */}
                  <div className="mb-3 border-t border-gray-100" />

                  {/* Customer list */}
                  <div className="min-h-[200px]">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {visible.map((c) => (
                        <motion.div
                          key={c.id}
                          layout
                          initial={{ opacity: 0, x: 30 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 25,
                          }}
                          className="flex items-center gap-3 rounded-lg px-2 py-2"
                        >
                          <div
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${tierColor[c.tier]}`}
                          >
                            {c.name[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800">
                              {c.name}
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tierText[c.tier]}`}
                          >
                            {c.tier}
                          </span>
                          <span className="w-16 text-right text-sm font-semibold text-gray-700 tabular-nums">
                            ${c.amount}/mo
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <AnimatePresence>
                      {moreCount > 0 && (
                        <motion.div
                          key="more"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="mt-1 px-2 text-xs text-gray-400"
                        >
                          and {moreCount} more
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
