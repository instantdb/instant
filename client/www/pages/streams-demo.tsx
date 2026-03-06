import Head from 'next/head';
import { StreamsDemo } from '@/components/new-landing/StreamsDemo';
import { StreamsDemoEventFeed } from '@/components/new-landing/StreamsDemoEventFeed';
import { StreamsDemoPubSub } from '@/components/new-landing/StreamsDemoPubSub';

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
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Current
            </h2>
            <h3 className="mb-6 text-2xl font-semibold">Streams</h3>
            <div className="rounded-xl bg-radial from-white to-[#FFF0E6] px-6 py-6">
              <StreamsDemo />
            </div>
          </section>

          {/* Event Feed */}
          <section>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Variation 1
            </h2>
            <h3 className="mb-6 text-2xl font-semibold">Event Feed</h3>
            <div className="rounded-xl bg-radial from-white to-[#FFF0E6] px-6 py-6">
              <StreamsDemoEventFeed />
            </div>
          </section>

          {/* Publish / Subscribe */}
          <section>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-gray-400">
              Variation 2
            </h2>
            <h3 className="mb-6 text-2xl font-semibold">
              Publish / Subscribe
            </h3>
            <div className="rounded-xl bg-radial from-white to-[#FFF0E6] px-6 py-6">
              <StreamsDemoPubSub />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
