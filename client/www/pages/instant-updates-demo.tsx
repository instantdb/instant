import {
  FeelTheDifferenceDemo,
  UnderTheHoodDemo,
  CodeAndResultDemo,
  DragReorderDemo,
  SideBySideDemo,
  SyncPulseDemo,
} from '@/components/new-landing/InstantUpdatesDemoIdeas';

export default function InstantUpdatesDemoPage() {
  return (
    <div className="min-h-screen bg-linear-to-b from-[#F7F7F7] to-white px-6 py-16">
      <div className="landing-width mx-auto">
        <div className="mb-16 sm:text-center">
          <h2 className="text-3xl font-semibold sm:text-7xl">
            The Sync Engine
          </h2>
          <p className="mt-6 max-w-2xl text-[21px] sm:mx-auto">
            Apps powered by Instant feel smoother. No loading spinners. No
            waiting. No refreshing to check if it worked. Changes just happen.
          </p>
        </div>

        <div className="flex flex-col gap-16">
          <div>
            <div className="mb-4 text-sm font-semibold tracking-wide text-gray-400 uppercase">
              New: Scrubbable causality — one action, two models
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <SectionText />
              <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-12 py-9">
                <SyncPulseDemo />
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-200" />

          {/* E: Side-by-side (favorite) */}
          <div>
            <div className="mb-4 text-sm font-semibold tracking-wide text-gray-400 uppercase">
              E: Side-by-side — same click, feel the difference
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <SectionText />
              <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-12 py-9">
                <SideBySideDemo />
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-200" />

          {/* A: Feel the Difference */}
          <div>
            <div className="mb-4 text-sm font-semibold tracking-wide text-gray-400 uppercase">
              A: &ldquo;Feel the Difference&rdquo; — latency toggle
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <SectionText />
              <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-20 py-9">
                <FeelTheDifferenceDemo />
              </div>
            </div>
          </div>

          {/* B: Under the Hood */}
          <div>
            <div className="mb-4 text-sm font-semibold tracking-wide text-gray-400 uppercase">
              B: Under the hood — optimistic update pipeline
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <SectionText />
              <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-20 py-9">
                <UnderTheHoodDemo />
              </div>
            </div>
          </div>

          {/* C: Code + Result */}
          <div>
            <div className="mb-4 text-sm font-semibold tracking-wide text-gray-400 uppercase">
              C: Code + Result — show the one-liner
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <SectionText />
              <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-20 py-9">
                <CodeAndResultDemo />
              </div>
            </div>
          </div>

          {/* D: Drag to Reorder */}
          <div>
            <div className="mb-4 text-sm font-semibold tracking-wide text-gray-400 uppercase">
              D: Drag to reorder — richer interaction
            </div>
            <div className="grid grid-cols-3 items-center gap-6">
              <SectionText />
              <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-20 py-9">
                <DragReorderDemo />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionText() {
  return (
    <div className="col-span-1">
      <h3 className="text-2xl font-semibold sm:text-3xl">Instant updates</h3>
      <p className="mt-2 text-lg">
        Click a button, toggle a switch, type in a field — whatever you do, you
        see the result right away. Your apps feel more responsive and alive and
        your users stay in flow.
      </p>
    </div>
  );
}
