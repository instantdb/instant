import {
  TypeSyncDemo,
  SharedChecklistDemo,
  LiveCursorsDemo,
  EmojiReactionsDemo,
  DeviceFrameReactionsDemo,
} from '@/components/new-landing/SyncDemoIdeas';

const SECTION_COPY = {
  title: 'Real-time sync',
  description:
    'Multiplayer experiences work out of the box. If one person makes a change, everyone else can see it right away. No need to refresh or re-open the app to see the latest.',
};

const variants = [
  {
    label: 'A',
    name: 'Type to Sync',
    hint: 'User types on Laptop, text propagates character-by-character to Phone',
    Demo: TypeSyncDemo,
  },
  {
    label: 'B',
    name: 'Shared Checklist',
    hint: 'User checks tasks on Laptop; "Alex" checks tasks on Phone. Changes propagate with a highlight pulse.',
    Demo: SharedChecklistDemo,
  },
  {
    label: 'C',
    name: 'Live Cursors',
    hint: 'Hover over the Laptop canvas — your cursor appears on the Phone with slight lag. Alex moves autonomously.',
    Demo: LiveCursorsDemo,
  },
  {
    label: 'D',
    name: 'Emoji Reactions',
    hint: 'Click reactions on Laptop — counts sync on both. Simulated users react periodically.',
    Demo: EmojiReactionsDemo,
  },
  {
    label: 'E',
    name: 'Device Frame Reactions',
    hint: 'MacBook + iPhone CSS frames with Slack-style emoji reactions. Click on laptop, see it sync to phone.',
    Demo: DeviceFrameReactionsDemo,
  },
];

export default function SyncDemoIdeasPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Real-time Sync — Demo Variants
        </h1>
        <p className="mb-16 text-gray-500">
          Five interactive concepts for the "Real-time sync" section. Each shown
          in homepage layout.
        </p>

        <div className="space-y-24">
          {variants.map(({ label, name, hint, Demo }) => (
            <div key={label}>
              <div className="mb-2 text-sm font-semibold tracking-wide text-orange-500 uppercase">
                Variant {label}: {name}
              </div>
              <p className="mb-4 text-xs text-gray-400">{hint}</p>

              {/* Homepage-identical layout */}
              <div className="grid grid-cols-3 items-center gap-6">
                <div className="col-span-1">
                  <h3 className="text-2xl font-semibold sm:text-3xl">
                    {SECTION_COPY.title}
                  </h3>
                  <p className="mt-2 text-lg">{SECTION_COPY.description}</p>
                </div>
                <div className="col-span-2 bg-[#FFE7E7]/20 px-20 py-9">
                  <Demo />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
