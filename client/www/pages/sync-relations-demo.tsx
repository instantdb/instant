import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
import { SyncRelationsV1 } from '@/components/new-landing/SyncRelationsV1';
import { SyncRelationsV2 } from '@/components/new-landing/SyncRelationsV2';
import { SyncRelationsV3 } from '@/components/new-landing/SyncRelationsV3';
import { SyncRelationsV4 } from '@/components/new-landing/SyncRelationsV4';
import { SyncRelationsV5 } from '@/components/new-landing/SyncRelationsV5';

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

        {/* Variant 4: Messaging Query Shapes */}
        <section>
          <h2 className="mb-1 text-2xl font-bold">
            Variant 4: Query Shapes
          </h2>
          <p className="mb-8 text-gray-500">
            One messaging app, two query shapes — toggle between
            channels &rarr; messages and users &rarr; messages to see the query
            change.
          </p>
          <SyncRelationsV4 />
        </section>

        {/* Variant 5: Dual Live Queries */}
        <section>
          <h2 className="mb-1 text-2xl font-bold">
            Variant 5: Dual Live Queries
          </h2>
          <p className="mb-8 text-gray-500">
            Two live views of the same data — messages by channel and messages
            by user — each with its own query, both updating in real time.
          </p>
          <SyncRelationsV5 />
        </section>
      </main>
    </div>
  );
}
