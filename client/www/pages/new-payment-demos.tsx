import Head from 'next/head';
import { LiveTransactionFeedDemo } from '@/components/new-landing/PaymentsIdea_LiveFeed';
import { CheckoutFlowDemo } from '@/components/new-landing/PaymentsIdea_CheckoutFlow';
import { PricingBuilderDemo } from '@/components/new-landing/PaymentsIdea_PricingBuilderV2';
import { SubscriptionLifecycleDemo } from '@/components/new-landing/PaymentsIdea_Lifecycle';
import { RevenueDashboardDemo } from '@/components/new-landing/PaymentsIdea_Dashboard';

export default function NewPaymentDemosPage() {
  return (
    <>
      <Head>
        <title>Payment Demo Ideas — Instant</title>
      </Head>
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h1 className="mb-2 text-3xl font-bold">Payment Demo Ideas</h1>
        <p className="mb-16 text-lg text-gray-500">
          Four new ideas + the existing dashboard demo, side by side.
        </p>

        <div className="space-y-20">
          {/* Existing */}
          <section>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Current
            </h2>
            <h3 className="mb-6 text-2xl font-semibold">
              Revenue Dashboard
            </h3>
            <div className="rounded-xl bg-radial from-white to-[#FFF9F4] px-6 py-6">
              <RevenueDashboardDemo />
            </div>
          </section>

          {/* Idea 1: Live Feed */}
          <section>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Idea 1
            </h2>
            <h3 className="mb-2 text-2xl font-semibold">
              Live Transaction Feed
            </h3>
            <p className="mb-6 text-gray-500">
              Transactions slide in one-by-one. Running total ticks up. Color-coded by type.
            </p>
            <div className="rounded-xl bg-radial from-white to-[#FFF9F4] px-6 py-6">
              <LiveTransactionFeedDemo />
            </div>
          </section>

          {/* Idea 2: Checkout Flow */}
          <section>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Idea 2
            </h2>
            <h3 className="mb-2 text-2xl font-semibold">
              Checkout → Ka-ching
            </h3>
            <p className="mb-6 text-gray-500">
              Animated cursor fills checkout form, clicks Pay, success animation, revenue counter ticks up.
            </p>
            <div className="rounded-xl bg-radial from-white to-[#EEF2FF] px-6 py-6">
              <CheckoutFlowDemo />
            </div>
          </section>

          {/* Idea 3: Pricing Builder */}
          <section>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Idea 3
            </h2>
            <h3 className="mb-2 text-2xl font-semibold">
              Pricing Builder (Interactive)
            </h3>
            <p className="mb-6 text-gray-500">
              Toggle modes, adjust price slider, live checkout preview updates instantly.
            </p>
            <div className="rounded-xl bg-radial from-white to-[#F5F0FF] px-6 py-6">
              <PricingBuilderDemo />
            </div>
          </section>

          {/* Idea 4: Subscription Lifecycle */}
          <section>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Idea 4
            </h2>
            <h3 className="mb-2 text-2xl font-semibold">
              Subscription Lifecycle
            </h3>
            <p className="mb-6 text-gray-500">
              Animated timeline: signup → first charge → renewal → upgrade → revenue bump.
            </p>
            <div className="rounded-xl bg-radial from-white to-[#F0FDF4] px-6 py-6">
              <SubscriptionLifecycleDemo />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
