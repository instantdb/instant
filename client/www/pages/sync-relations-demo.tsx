import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
import { SyncRelationsV1 } from '@/components/new-landing/SyncRelationsV1';
import { SyncRelationsV2 } from '@/components/new-landing/SyncRelationsV2';
import { SyncRelationsV3 } from '@/components/new-landing/SyncRelationsV3';

export default function SyncRelationsDemo() {
  return (
    <div className="text-off-black">
      <MainNav />
      <Head>
        <title>Sync + Relations — Demo Variants</title>
      </Head>
      <main className="mx-auto max-w-6xl space-y-24 px-4 pt-24 pb-16">
        {/* Variant 1: Query Mirror */}
        <section>
          <h2 className="mb-1 text-2xl font-bold">
            Variant 1: Query Mirror
          </h2>
          <p className="mb-8 text-gray-500">
            Side-by-side — app on the left, live InstaQL query on the right.
            Click lists and items to see the active query depth change.
          </p>
          <SyncRelationsV1 />
        </section>

        {/* Variant 2: Anatomy Labels */}
        <section>
          <h2 className="mb-1 text-2xl font-bold">
            Variant 2: Anatomy Labels
          </h2>
          <p className="mb-8 text-gray-500">
            Full-width app with colored entity labels above each panel. InstaQL
            query below with matching entity highlights.
          </p>
          <SyncRelationsV2 />
        </section>

        {/* Variant 3: Tab Toggle */}
        <section>
          <h2 className="mb-1 text-2xl font-bold">
            Variant 3: Tab Toggle
          </h2>
          <p className="mb-8 text-gray-500">
            App/Query tabs in the demo top bar. Query tab shows InstaQL with
            record-count annotations and a truncated JSON result.
          </p>
          <SyncRelationsV3 />
        </section>
      </main>
    </div>
  );
}
