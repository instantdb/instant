'use client';

import { AnimateIn } from './AnimateIn';
import { RevenueDashboardDemo } from './PaymentsIdea_Dashboard';

export function Payments() {
  return (
    <AnimateIn>
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <h3 className="text-2xl font-semibold sm:text-3xl">Payments</h3>
          <p className="mt-2 text-lg">
            Build apps that monetize. Easily add one-time purchases,
            subscriptions, or usage-based billing by telling AI to add Stripe to
            your Instant app.
          </p>
        </div>
        <div className="col-span-2">
          <div className="bg-radial from-white to-[#FFF9F4] px-6 py-6">
            <RevenueDashboardDemo />
          </div>
        </div>
      </div>
    </AnimateIn>
  );
}
