import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// --- Plan data ---

type PlanId = 'one-time' | 'monthly' | 'usage';

interface Plan {
  id: PlanId;
  name: string;
  price: string;
  detail: string;
}

const plans: Plan[] = [
  {
    id: 'one-time',
    name: 'One-time license',
    price: '$49',
    detail: 'one-time',
  },
  {
    id: 'monthly',
    name: 'Monthly plan',
    price: '$20/mo',
    detail: 'subscription',
  },
  {
    id: 'usage',
    name: 'Pay per use',
    price: '~$0.01',
    detail: '/request',
  },
];

// --- Confetti dots ---

function ConfettiDots() {
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 360;
    const rad = (angle * Math.PI) / 180;
    const distance = 40 + Math.random() * 20;
    const x = Math.cos(rad) * distance;
    const y = Math.sin(rad) * distance;
    const colors = [
      'bg-blue-400',
      'bg-green-400',
      'bg-purple-400',
      'bg-yellow-400',
      'bg-pink-400',
      'bg-indigo-400',
    ];
    const color = colors[i % colors.length];
    const size = 3 + Math.random() * 3;

    return (
      <motion.div
        key={i}
        className={`absolute rounded-full ${color}`}
        style={{
          width: size,
          height: size,
          left: '50%',
          top: '50%',
          marginLeft: -size / 2,
          marginTop: -size / 2,
        }}
        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
        animate={{
          x,
          y,
          opacity: [1, 1, 0],
          scale: [0, 1.2, 0.6],
        }}
        transition={{
          duration: 0.7,
          ease: 'easeOut',
          delay: i * 0.02,
        }}
      />
    );
  });

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {dots}
    </div>
  );
}

// --- Checkout panels per plan type ---

function OneTimeCheckout({ onPay }: { onPay: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-xs text-gray-500">Lifetime license</span>
        <span className="text-sm font-semibold text-gray-800">$49.00</span>
      </div>
      <div className="mb-3 flex items-center justify-between border-t border-gray-100 px-1 pt-2">
        <span className="text-xs font-medium text-gray-600">Total</span>
        <span className="text-sm font-bold text-gray-900">$49.00</span>
      </div>
      <motion.button
        onClick={onPay}
        className="w-full rounded-lg bg-blue-500 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        whileTap={{ scale: 0.98 }}
      >
        Buy Now
      </motion.button>
    </div>
  );
}

function SubscriptionCheckout({ onPay }: { onPay: () => void }) {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const monthly = 20;
  const annual = 16;
  const price = cycle === 'monthly' ? monthly : annual;
  const total = cycle === 'monthly' ? monthly : annual * 12;

  return (
    <div>
      <div className="mb-3 flex rounded-lg bg-gray-50 p-0.5">
        {(['monthly', 'annual'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setCycle(option)}
            className={`relative flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              cycle === option
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {option === 'monthly' ? 'Monthly' : 'Annual'}
            {option === 'annual' && (
              <span className="ml-1 text-[10px] font-semibold text-green-600">
                -20%
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-xs text-gray-500">
          {cycle === 'monthly' ? 'Billed monthly' : 'Billed annually'}
        </span>
        <span className="text-sm font-semibold text-gray-800">${price}/mo</span>
      </div>
      <div className="mb-3 flex items-center justify-between border-t border-gray-100 px-1 pt-2">
        <span className="text-xs font-medium text-gray-600">
          {cycle === 'monthly' ? 'Monthly total' : 'Annual total'}
        </span>
        <div className="text-right">
          <span className="text-sm font-bold text-gray-900">
            ${total.toFixed(2)}
          </span>
          {cycle === 'annual' && (
            <div className="text-[10px] text-green-600">
              Save ${((monthly - annual) * 12).toFixed(2)}/yr
            </div>
          )}
        </div>
      </div>
      <motion.button
        onClick={onPay}
        className="w-full rounded-lg bg-blue-500 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        whileTap={{ scale: 0.98 }}
      >
        Subscribe
      </motion.button>
    </div>
  );
}

function UsageCheckout({ onPay }: { onPay: () => void }) {
  const [requests, setRequests] = useState(5000);
  const costPerRequest = 0.01;
  const estimated = requests * costPerRequest;

  return (
    <div>
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-gray-500">Estimated requests/mo</span>
          <span className="text-xs font-semibold text-gray-800 tabular-nums">
            {requests.toLocaleString()}
          </span>
        </div>
        <input
          type="range"
          min={1000}
          max={50000}
          step={1000}
          value={requests}
          onChange={(e) => setRequests(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-500 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-gray-400">
          <span>1k</span>
          <span>50k</span>
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-xs text-gray-500">
          {requests.toLocaleString()} x $0.01
        </span>
        <span className="text-sm font-semibold text-gray-800">
          ~${estimated.toFixed(2)}/mo
        </span>
      </div>
      <motion.button
        onClick={onPay}
        className="w-full rounded-lg bg-blue-500 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        whileTap={{ scale: 0.98 }}
      >
        Start
      </motion.button>
    </div>
  );
}

// --- Success overlay ---

function SuccessState() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="relative">
        <motion.div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 20,
            delay: 0.1,
          }}
        >
          <motion.svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="text-green-600"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
          >
            <motion.path
              d="M5 13L10 18L20 6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            />
          </motion.svg>
        </motion.div>
        <ConfettiDots />
      </div>
      <motion.p
        className="mt-3 text-sm font-semibold text-gray-800"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        Payment successful!
      </motion.p>
    </motion.div>
  );
}

// --- Main component ---

export function CheckoutFlowDemo() {
  const [selected, setSelected] = useState<PlanId>('one-time');
  const [showSuccess, setShowSuccess] = useState(false);

  const handlePay = useCallback(() => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
    }, 2000);
  }, []);

  return (
    <div className="relative rounded-xl bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-800">
          Choose your plan
        </h3>
      </div>

      {/* Plan options */}
      <div className="mb-4 space-y-2">
        {plans.map((plan) => {
          const isSelected = selected === plan.id;
          return (
            <motion.button
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
              }`}
              whileTap={{ scale: 0.99 }}
            >
              {/* Radio indicator */}
              <div
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isSelected ? 'border-blue-500' : 'border-gray-300'
                }`}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      className="h-2 w-2 rounded-full bg-blue-500"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 25,
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Plan info */}
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <div
                    className={`text-sm font-medium ${
                      isSelected ? 'text-gray-800' : 'text-gray-700'
                    }`}
                  >
                    {plan.name}
                  </div>
                  <div className="text-xs text-gray-400">{plan.detail}</div>
                </div>
                <div
                  className={`text-sm font-semibold ${
                    isSelected ? 'text-blue-600' : 'text-gray-600'
                  }`}
                >
                  {plan.price}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Checkout preview */}
      <div className="rounded-lg border border-gray-100 bg-white p-3">
        <AnimatePresence mode="wait">
          {selected === 'one-time' && (
            <motion.div
              key="one-time"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <OneTimeCheckout onPay={handlePay} />
            </motion.div>
          )}
          {selected === 'monthly' && (
            <motion.div
              key="monthly"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <SubscriptionCheckout onPay={handlePay} />
            </motion.div>
          )}
          {selected === 'usage' && (
            <motion.div
              key="usage"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <UsageCheckout onPay={handlePay} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Success overlay */}
      <AnimatePresence>{showSuccess && <SuccessState />}</AnimatePresence>
    </div>
  );
}
