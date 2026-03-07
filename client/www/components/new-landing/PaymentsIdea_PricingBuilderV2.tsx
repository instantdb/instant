import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

type Mode = 'one-time' | 'subscription' | 'usage';

const modes: { id: Mode; label: string }[] = [
  { id: 'one-time', label: 'One-time' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'usage', label: 'Usage-based' },
];

const modeConfig: Record<
  Mode,
  {
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    suffix: string;
    buttonLabel: string;
    badgeLabel: string;
    accentText: string;
    accentBg: string;
    accentBorder: string;
    accentBtn: string;
    accentSlider: string;
    badgeDot: string;
  }
> = {
  'one-time': {
    min: 9,
    max: 499,
    step: 1,
    format: (v) => `$${v}`,
    suffix: '',
    buttonLabel: 'Buy Now',
    badgeLabel: 'One-time payment',
    accentText: 'text-blue-600',
    accentBg: 'bg-blue-50',
    accentBorder: 'border-blue-200',
    accentBtn: 'bg-blue-600 hover:bg-blue-700',
    accentSlider: 'accent-blue-500',
    badgeDot: 'bg-blue-500',
  },
  subscription: {
    min: 5,
    max: 99,
    step: 1,
    format: (v) => `$${v}`,
    suffix: '/mo',
    buttonLabel: 'Subscribe',
    badgeLabel: 'Monthly subscription',
    accentText: 'text-purple-600',
    accentBg: 'bg-purple-50',
    accentBorder: 'border-purple-200',
    accentBtn: 'bg-purple-600 hover:bg-purple-700',
    accentSlider: 'accent-purple-500',
    badgeDot: 'bg-purple-500',
  },
  usage: {
    min: 1,
    max: 100,
    step: 1,
    format: (v) => `$${(v / 1000).toFixed(3)}`,
    suffix: ' per unit',
    buttonLabel: 'Start Using',
    badgeLabel: 'Usage-based pricing',
    accentText: 'text-green-600',
    accentBg: 'bg-green-50',
    accentBorder: 'border-green-200',
    accentBtn: 'bg-green-600 hover:bg-green-700',
    accentSlider: 'accent-green-500',
    badgeDot: 'bg-green-500',
  },
};

const defaultValues: Record<Mode, number> = {
  'one-time': 49,
  subscription: 20,
  usage: 10,
};

function AnimatedPrice({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex overflow-hidden ${className ?? ''}`}>
      <AnimatePresence mode="popLayout">
        {value.split('').map((char, i) => (
          <motion.span
            key={`${i}-${char}`}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
            className="inline-block"
          >
            {char}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

export function PricingBuilderDemo() {
  const [activeMode, setActiveMode] = useState<Mode>('one-time');
  const [values, setValues] = useState<Record<Mode, number>>(defaultValues);

  const config = modeConfig[activeMode];
  const rawValue = values[activeMode];
  const formattedPrice = config.format(rawValue);

  const handleModeChange = (mode: Mode) => {
    setActiveMode(mode);
  };

  const handleValueChange = (v: number) => {
    setValues((prev) => ({ ...prev, [activeMode]: v }));
  };

  const sliderPercent =
    ((rawValue - config.min) / (config.max - config.min)) * 100;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex gap-5">
        {/* Left side: Builder controls */}
        <div className="flex w-[55%] flex-col">
          {/* Mode toggle */}
          <div className="mb-5 flex items-center gap-1 rounded-full bg-gray-100 p-0.5 text-xs font-medium">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  activeMode === mode.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Price slider */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                Set your price
              </span>
              <span className="text-xs text-gray-400">
                {Math.round(sliderPercent)}%
              </span>
            </div>
            <input
              type="range"
              min={config.min}
              max={config.max}
              step={config.step}
              value={rawValue}
              onChange={(e) => handleValueChange(Number(e.target.value))}
              className={`w-full ${config.accentSlider}`}
            />
            <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
              <span>{config.format(config.min)}</span>
              <span>{config.format(config.max)}</span>
            </div>
          </div>

          {/* Selected price display */}
          <div
            className={`rounded-lg border ${config.accentBorder} ${config.accentBg} p-3`}
          >
            <div className="mb-1 text-xs font-medium text-gray-500">
              Current price
            </div>
            <div className="flex items-baseline gap-1">
              <AnimatedPrice
                value={formattedPrice}
                className={`text-2xl font-bold ${config.accentText}`}
              />
              {config.suffix && (
                <span className="text-sm text-gray-400">{config.suffix}</span>
              )}
            </div>
            {activeMode === 'usage' && (
              <div className="mt-1 text-xs text-gray-400">
                ~{config.format(rawValue * 10)} estimated for 10,000 units/mo
              </div>
            )}
          </div>
        </div>

        {/* Right side: Live checkout preview */}
        <div className="flex w-[45%] flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMode}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="flex flex-1 flex-col rounded-lg border border-gray-200 bg-gray-50 p-4"
            >
              {/* Badge */}
              <div className="mb-4">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border ${config.accentBorder} ${config.accentBg} px-2.5 py-0.5 text-xs font-medium ${config.accentText}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${config.badgeDot}`}
                  />
                  {config.badgeLabel}
                </span>
              </div>

              {/* Price */}
              <div className="mb-1 text-xs text-gray-500">Total</div>
              <div className="mb-4 flex items-baseline gap-1">
                <AnimatedPrice
                  value={formattedPrice}
                  className={`text-3xl font-bold ${config.accentText}`}
                />
                {config.suffix && (
                  <span className="text-sm text-gray-400">{config.suffix}</span>
                )}
              </div>

              {activeMode === 'usage' && (
                <div className="-mt-3 mb-4 text-xs text-gray-400">
                  Est. ${((rawValue / 1000) * 10000).toFixed(2)}/mo at 10k units
                </div>
              )}

              {/* Action button */}
              <button
                className={`w-full rounded-lg ${config.accentBtn} px-4 py-2 text-sm font-medium text-white transition-colors active:scale-[0.98]`}
              >
                {config.buttonLabel}
              </button>

              {/* Powered by */}
              <div className="mt-auto pt-3 text-center text-[10px] text-gray-300">
                Powered by Instant
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
