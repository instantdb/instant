import { AutoPlayDemo } from '@/components/new-landing/InstantUpdatesDemoIdeas';
import { RealtimeChatDemo } from '@/components/new-landing/SyncDemoIdeas';
import { OfflineDemoReactions } from '@/components/new-landing/OfflineDemoIdeas';

export default function SyncChatDemoPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Sync Engine — Chat Demo Preview
        </h1>
        <p className="mb-16 text-gray-500">
          Full Sync Engine section with live chat replacing the todo checklist
          for real-time sync.
        </p>

        <div className="flex flex-col gap-9">
          {/* Instant updates — text left, demo right */}
          <div className="grid grid-cols-3 items-center gap-6">
            <div className="col-span-1">
              <h3 className="text-2xl font-semibold sm:text-3xl">
                Instant updates
              </h3>
              <p className="mt-2 text-lg">
                Click a button, toggle a switch, type in a field — whatever you
                do, you see the result right away. Your apps feel more
                responsive and alive and your users stay in flow.
              </p>
            </div>
            <div className="col-span-2 bg-[#B8B8B8]/20 px-12 py-9">
              <AutoPlayDemo />
            </div>
          </div>

          {/* Real-time sync — demo left, text right */}
          <div className="grid grid-cols-3 items-center gap-6">
            <div className="col-span-2 bg-[#FFE7E7]/20 px-12 py-9">
              <RealtimeChatDemo />
            </div>
            <div className="col-span-1">
              <h3 className="text-2xl font-semibold sm:text-3xl">
                Real-time sync
              </h3>
              <p className="mt-2 text-lg">
                Multiplayer experiences work out of the box. If one person makes
                a change, everyone else can see it right away. No need to
                refresh or re-open the app to see the latest.
              </p>
            </div>
          </div>

          {/* Works offline — text left, demo right */}
          <div className="grid grid-cols-3 items-center gap-6">
            <div className="col-span-1">
              <h3 className="text-2xl font-semibold sm:text-3xl">
                Works offline
              </h3>
              <p className="mt-2 text-lg">
                Apps built with Instant keep working when you lose connection.
                When your users get back online, everything syncs up without
                them having to do a thing. Pure magic.
              </p>
            </div>
            <div className="col-span-2 bg-[#B8B8B8]/20 px-12 py-9">
              <OfflineDemoReactions />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
