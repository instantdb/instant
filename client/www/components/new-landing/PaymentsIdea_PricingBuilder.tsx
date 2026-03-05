import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

type PaymentModel = 'one-time' | 'subscription' | 'usage';

const models: {
  key: PaymentModel;
  label: string;
  color: string;
  dotColor: string;
  bgColor: string;
  borderColor: string;
  btnColor: string;
  price: string;
  unit: string;
  description: string;
  features: string[];
}[] = [
  {
    key: 'one-time',
    label: 'One-time',
    color: 'text-blue-600',
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    btnColor: 'bg-blue-600 hover:bg-blue-700',
    price: '$49',
    unit: 'one-time',
    description: 'Lifetime license',
    features: ['Perpetual access', '1 year of updates', 'Community support'],
  },
  {
    key: 'subscription',
    label: 'Subscription',
    color: 'text-purple-600',
    dotColor: 'bg-purple-500',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    btnColor: 'bg-purple-600 hover:bg-purple-700',
    price: '$20',
    unit: '/mo',
    description: 'Monthly plan',
    features: ['Unlimited access', 'Priority support', 'All future features'],
  },
  {
    key: 'usage',
    label: 'Usage-based',
    color: 'text-green-600',
    dotColor: 'bg-green-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    btnColor: 'bg-green-600 hover:bg-green-700',
    price: '$0.01',
    unit: '/request',
    description: 'Pay per use',
    features: ['No minimum', 'Scale to zero', 'Volume discounts'],
  },
];

function Toggle({
  checked,
  onChange,
  color,
}: {
  checked: boolean;
  onChange: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? color : 'bg-gray-200'
      }`}
    >
      <motion.span
        className="block h-3.5 w-3.5 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 18 : 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

export function PricingBuilderDemo() {
  const [enabled, setEnabled] = useState<Record<PaymentModel, boolean>>({
    'one-time': true,
    subscription: true,
    usage: true,
  });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimeout = React.useRef<NodeJS.Timeout | null>(null);

  const toggleModel = useCallback((key: PaymentModel) => {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSelect = useCallback((label: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(`${label} selected!`);
    toastTimeout.current = setTimeout(() => setToast(null), 1500);
  }, []);

  const enabledModels = models.filter((m) => enabled[m.key]);

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      {/* Toggle switches */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {models.map((m) => (
            <div key={m.key} className="flex items-center gap-1.5">
              <Toggle
                checked={enabled[m.key]}
                onChange={() => toggleModel(m.key)}
                color={
                  m.key === 'one-time'
                    ? 'bg-blue-500'
                    : m.key === 'subscription'
                      ? 'bg-purple-500'
                      : 'bg-green-500'
                }
              />
              <span
                className={`text-xs font-medium ${
                  enabled[m.key] ? 'text-gray-700' : 'text-gray-400'
                }`}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing cards */}
      <div className="min-h-[180px]">
        <div className="flex gap-3">
          <AnimatePresence mode="popLayout">
            {enabledModels.map((m) => (
              <motion.div
                key={m.key}
                layout
                initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className={`flex-1 rounded-lg border ${m.borderColor} ${m.bgColor} p-3`}
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dotColor}`} />
                  <span className={`text-xs font-semibold ${m.color}`}>
                    {m.description}
                  </span>
                </div>
                <div className="mb-2">
                  <span className={`text-xl font-bold ${m.color}`}>
                    {m.price}
                  </span>
                  <span className="text-xs text-gray-400"> {m.unit}</span>
                </div>
                <div className="mb-3 space-y-1">
                  {m.features.map((f) => (
                    <div key={f} className="flex items-center gap-1.5">
                      <svg
                        className={`h-3 w-3 shrink-0 ${m.color}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                      <span className="text-xs text-gray-600">{f}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleSelect(m.label)}
                  className={`w-full rounded-md ${m.btnColor} px-3 py-1.5 text-xs font-medium text-white transition-colors active:scale-[0.98]`}
                >
                  {m.key === 'one-time' ? 'Buy' : 'Select'}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {enabledModels.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full items-center justify-center rounded-lg border border-dashed border-gray-200 py-12"
            >
              <span className="text-xs text-gray-400">
                Toggle a payment model to add it
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Toast */}
      <div className="relative mt-3 flex h-5 items-center justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="absolute rounded-full bg-gray-800 px-3 py-0.5 text-xs font-medium text-white"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-1 text-center text-xs text-gray-400">
        Mix and match payment models
      </p>
    </div>
  );
}
