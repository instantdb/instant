'use client';

import { AnimateIn } from './AnimateIn';
import { SyncRelationsDemo } from './SyncRelationsDemo';
import { SectionIntro, SectionSubtitle, SectionTitle } from './typography';

export function SyncRelations() {
  return (
    <div className="space-y-16">
      {/* Section header */}
      <AnimateIn>
        <SectionIntro>
          <SectionTitle>Relational at the Core</SectionTitle>
          <SectionSubtitle>
            Real apps aren't flat. Data needs to connect. Most backends make you
            choose between real-time sync and relational queries. Instant gives
            you both.
          </SectionSubtitle>
        </SectionIntro>
      </AnimateIn>

      {/* Interactive demo */}
      <AnimateIn>
        <div className="mx-auto max-w-[1205px]">
          <SyncRelationsDemo />
        </div>
      </AnimateIn>
    </div>
  );
}
