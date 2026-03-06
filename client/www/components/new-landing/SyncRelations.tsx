'use client';

import { AnimateIn } from './AnimateIn';
import { SyncRelationsV1 } from './SyncRelationsV1';

export function SyncRelations() {
  return (
    <div className="space-y-16">
      {/* Section header */}
      <AnimateIn>
        <div className="sm:text-center">
          <h2 className="text-3xl font-semibold sm:text-6xl">
            Sync + Relations
          </h2>
          <p className="mt-6 max-w-3xl text-xl sm:mx-auto">
            Real apps aren't flat. Data needs to connect. Most backends make you
            choose between real-time sync and relational queries. Instant gives
            you both.
          </p>
        </div>
      </AnimateIn>

      {/* Interactive demo */}
      <AnimateIn>
        <div className="mx-auto max-w-[1205px]">
          <SyncRelationsV1 />
        </div>
      </AnimateIn>
    </div>
  );
}
