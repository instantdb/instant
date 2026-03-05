import { CustomerJourneyDemo } from '@/components/new-landing/PaymentsIdea_Journey';
import { RevenueDashboardDemo } from '@/components/new-landing/PaymentsIdea_Dashboard';
import { PricingBuilderDemo } from '@/components/new-landing/PaymentsIdea_PricingBuilder';
import { CodePreviewDemo } from '@/components/new-landing/PaymentsIdea_CodePreview';
import { CheckoutFlowDemo } from '@/components/new-landing/PaymentsIdea_Checkout';

const variants = [
  { label: 'Idea 1: Customer Journey Timeline', Demo: CustomerJourneyDemo },
  { label: 'Idea 2: Revenue Dashboard', Demo: RevenueDashboardDemo },
  { label: 'Idea 3: Pricing Page Builder', Demo: PricingBuilderDemo },
  { label: 'Idea 4: Code ↔ Preview', Demo: CodePreviewDemo },
  { label: 'Idea 5: Checkout Flow', Demo: CheckoutFlowDemo },
];

export default function PaymentsDemoIdeasPage() {
  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Payments Demo Ideas
        </h1>
        <p className="mb-10 text-gray-500">
          Five interactive demo concepts — each showing all 3 payment types
          (one-time, subscription, usage-based).
        </p>

        <div className="space-y-16">
          {variants.map(({ label, Demo }) => (
            <div key={label}>
              <p className="mb-3 text-sm font-semibold tracking-wide text-gray-400 uppercase">
                {label}
              </p>
              <div className="grid grid-cols-3 items-center gap-7">
                <div className="col-span-1">
                  <h3 className="text-2xl font-semibold sm:text-3xl">
                    Payments
                  </h3>
                  <p className="mt-2 text-lg">
                    Build apps that monetize. Easily add one-time purchases,
                    subscriptions, or usage-based billing by telling AI to add
                    Stripe to your Instant app.
                  </p>
                </div>
                <div className="col-span-2">
                  <div className="bg-radial from-white to-[#FFF9F4] px-6 py-6">
                    <Demo />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
