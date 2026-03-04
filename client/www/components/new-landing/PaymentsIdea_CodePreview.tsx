'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ---------------------------------------------------------------------------
// Tab data
// ---------------------------------------------------------------------------

const tabs = [
  { id: 'onetime' as const, label: 'One-time' },
  { id: 'subscription' as const, label: 'Subscription' },
  { id: 'usage' as const, label: 'Usage-based' },
];

type TabId = (typeof tabs)[number]['id'];

// ---------------------------------------------------------------------------
// Code snippets (JSX with syntax-highlighted spans)
// ---------------------------------------------------------------------------

function OnetimeCode() {
  return (
    <div className="space-y-1">
      <div>
        <span className="text-purple-400">const</span>
        <span className="text-gray-400"> {'{ '}</span>
        <span className="text-blue-300">url</span>
        <span className="text-gray-400">{' } = '}</span>
        <span className="text-purple-400">await</span>
        <span className="text-yellow-300"> stripe</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">checkout</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">sessions</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">create</span>
        <span className="text-gray-400">({"{"}</span>
      </div>
      <div className="pl-4">
        <span className="text-blue-300">mode</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"payment"</span>
        <span className="text-gray-400">,</span>
      </div>
      <div className="pl-4">
        <span className="text-blue-300">line_items</span>
        <span className="text-gray-400">: [{"{ "}</span>
        <span className="text-blue-300">price</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"price_pro"</span>
        <span className="text-gray-400">{" }],"}</span>
      </div>
      <div>
        <span className="text-gray-400">{"})"}</span>
      </div>
    </div>
  );
}

function SubscriptionCode() {
  return (
    <div className="space-y-1">
      <div>
        <span className="text-purple-400">const</span>
        <span className="text-blue-300"> sub </span>
        <span className="text-gray-400">= </span>
        <span className="text-purple-400">await</span>
        <span className="text-yellow-300"> stripe</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">subscriptions</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">create</span>
        <span className="text-gray-400">({"{"}</span>
      </div>
      <div className="pl-4">
        <span className="text-blue-300">customer</span>
        <span className="text-gray-400">: </span>
        <span className="text-orange-300">customerId</span>
        <span className="text-gray-400">,</span>
      </div>
      <div className="pl-4">
        <span className="text-blue-300">items</span>
        <span className="text-gray-400">: [{"{ "}</span>
        <span className="text-blue-300">price</span>
        <span className="text-gray-400">: </span>
        <span className="text-orange-300">selectedPlan</span>
        <span className="text-gray-400">{".priceId }],"}</span>
      </div>
      <div>
        <span className="text-gray-400">{"})"}</span>
      </div>
    </div>
  );
}

function UsageCode() {
  return (
    <div className="space-y-1">
      <div>
        <span className="text-purple-400">await</span>
        <span className="text-yellow-300"> stripe</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">billing</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">meterEvents</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">create</span>
        <span className="text-gray-400">({"{"}</span>
      </div>
      <div className="pl-4">
        <span className="text-blue-300">event_name</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"api_call"</span>
        <span className="text-gray-400">,</span>
      </div>
      <div className="pl-4">
        <span className="text-blue-300">payload</span>
        <span className="text-gray-400">: {"{ "}</span>
        <span className="text-blue-300">value</span>
        <span className="text-gray-400">: </span>
        <span className="text-orange-300">credits</span>
        <span className="text-gray-400">,</span>
        <span className="text-blue-300"> stripe_customer_id</span>
        <span className="text-gray-400">{" },"}</span>
      </div>
      <div>
        <span className="text-gray-400">{"})"}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview UIs
// ---------------------------------------------------------------------------

function OnetimePreview() {
  const [bought, setBought] = useState(false);

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-[200px] rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          One-time purchase
        </div>
        <div className="text-lg font-bold text-gray-800">Pro License</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">$49</div>
        <AnimatePresence mode="wait">
          {bought ? (
            <motion.button
              key="bought"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => setBought(false)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-500 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-600 active:scale-[0.98]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="text-white"
              >
                <path
                  d="M2.5 7.5L5.5 10.5L11.5 3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Purchased
            </motion.button>
          ) : (
            <motion.button
              key="buy"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => setBought(true)}
              className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.98]"
            >
              Buy now
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const plans = [
  { name: 'Free', price: '$0', priceDetail: '/mo', accent: 'border-gray-200' },
  {
    name: 'Pro',
    price: '$20',
    priceDetail: '/mo',
    accent: 'border-blue-500',
    popular: true,
  },
  {
    name: 'Team',
    price: '$50',
    priceDetail: '/mo',
    accent: 'border-gray-200',
  },
];

function SubscriptionPreview() {
  const [selected, setSelected] = useState('Pro');

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex gap-2">
        {plans.map((plan) => {
          const isSelected = selected === plan.name;
          return (
            <motion.button
              key={plan.name}
              onClick={() => setSelected(plan.name)}
              className={`relative w-[88px] rounded-lg border-2 bg-white px-2.5 py-3 text-left transition-colors ${
                isSelected ? 'border-blue-500' : 'border-gray-200'
              }`}
              whileTap={{ scale: 0.97 }}
            >
              {plan.popular && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-2 py-0.5 text-[9px] font-semibold text-white">
                  Popular
                </div>
              )}
              <div className="text-[11px] font-medium text-gray-500">
                {plan.name}
              </div>
              <div className="mt-0.5">
                <span className="text-lg font-bold text-gray-900">
                  {plan.price}
                </span>
                <span className="text-[10px] text-gray-400">
                  {plan.priceDetail}
                </span>
              </div>
              <div
                className={`mt-2 rounded-md py-1 text-center text-[10px] font-semibold transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isSelected ? 'Selected' : 'Select'}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function UsagePreview() {
  const used = 8234;
  const limit = 10000;
  const pct = Math.round((used / limit) * 100);

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-[220px] rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">API Usage</span>
          <span className="text-xs font-medium text-gray-400">
            This month
          </span>
        </div>
        <div className="mt-2 text-lg font-bold text-gray-800">
          {used.toLocaleString()}{' '}
          <span className="text-sm font-normal text-gray-400">
            / {(limit / 1000).toFixed(0)}k calls
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
          <span>{pct}% used</span>
          <span>{(limit - used).toLocaleString()} remaining</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CodePreviewDemo() {
  const [activeTab, setActiveTab] = useState<TabId>('onetime');

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm overflow-hidden">
      {/* Tab bar */}
      <div className="mb-4 flex gap-1 border-b border-gray-200 bg-gray-50 rounded-t-lg px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-gray-900'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="code-preview-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-500"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Split view — grid overlay trick for stable height */}
      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <div
              key={tab.id}
              className={isActive ? '' : 'pointer-events-none invisible'}
              aria-hidden={!isActive}
            >
              <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-lg border border-gray-200">
                {/* Left: Code */}
                <div className="bg-gray-900 p-4 font-mono text-[11px] leading-relaxed">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                    Code
                  </div>
                  {tab.id === 'onetime' && <OnetimeCode />}
                  {tab.id === 'subscription' && <SubscriptionCode />}
                  {tab.id === 'usage' && <UsageCode />}
                </div>

                {/* Right: Preview */}
                <div className="bg-gray-50">
                  <div className="px-4 pt-3">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                      Preview
                    </div>
                  </div>
                  {tab.id === 'onetime' && <OnetimePreview />}
                  {tab.id === 'subscription' && <SubscriptionPreview />}
                  {tab.id === 'usage' && <UsagePreview />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
