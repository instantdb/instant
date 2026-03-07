import Head from 'next/head';
import { StreamsDemo } from '@/components/new-landing/StreamsDemo';
import { StreamsDemoJoin } from '@/components/new-landing/StreamsDemoEventFeed';

export default function StreamsDemoPage() {
  return (
    <>
      <Head>
        <title>Streams Demo — Instant</title>
      </Head>
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="space-y-20">
          {/* Current */}
          <section>
            <h2 className="mb-1 text-sm font-medium tracking-wide text-gray-400 uppercase">
              Current
            </h2>
            <h3 className="mb-6 text-2xl font-semibold">Streams</h3>
            <div className="rounded-xl bg-radial from-white to-[#FFF0E6] px-6 py-6">
              <StreamsDemo />
            </div>
          </section>

          {/* Data Pellets + Join */}
          <section>
            <h2 className="mb-1 text-sm font-medium tracking-wide text-gray-400 uppercase">
              Variation
            </h2>
            <h3 className="mb-6 text-2xl font-semibold">Data Pellets + Join</h3>
            <div className="rounded-xl bg-radial from-white to-[#FFF0E6] px-6 py-6">
              <StreamsDemoJoin />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
