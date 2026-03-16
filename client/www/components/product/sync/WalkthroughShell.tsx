import { useState, useRef, useEffect, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface WalkthroughStep {
  title: string;
  description: string;
}

export function WalkthroughShell<S extends WalkthroughStep>({
  steps,
  designWidth,
  designHeight,
  children,
}: {
  steps: S[];
  designWidth: number;
  designHeight: number;
  children: (opts: { step: S; prevStep: S; stepIdx: number }) => ReactNode;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const prevStep = steps[Math.max(0, stepIdx - 1)];

  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / designWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div className="mt-4 rounded-lg border bg-gray-50 p-5">
      <div
        ref={outerRef}
        className="flex justify-center"
        style={{ height: designHeight * scale }}
      >
        <div
          className="relative"
          style={{
            width: designWidth,
            height: designHeight,
            transformOrigin: 'top center',
            transform: `scale(${scale})`,
          }}
        >
          {children({ step, prevStep, stepIdx })}
        </div>
      </div>

      {/* Step indicator + nav */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
        <button
          onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          disabled={stepIdx === 0}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-700 active:scale-95 disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIdx(i)}
              className={`h-3 w-3 rounded-full transition-colors duration-300 ${
                i === stepIdx ? 'bg-orange-500' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => setStepIdx((s) => Math.min(steps.length - 1, s + 1))}
          disabled={stepIdx === steps.length - 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-30"
        >
          <ChevronRightIcon className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>

      {/* Step text */}
      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-base font-medium text-gray-900">{step.title}</p>
            <p className="mt-0.5 text-base text-gray-500">{step.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
