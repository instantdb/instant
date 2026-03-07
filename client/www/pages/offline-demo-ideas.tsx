import {
  OfflineDemoRevived,
  OfflineDemoReactions,
} from '@/components/new-landing/OfflineDemoIdeas';

export default function OfflineDemoIdeasPage() {
  return (
    <div className="text-off-black relative min-h-screen bg-white">
      <div className="landing-width mx-auto py-16 sm:py-24">
        {/* Variant 1: Check-ins (original) */}
        <div className="grid grid-cols-3 items-center gap-6">
          <div className="col-span-1">
            <h3 className="text-2xl font-semibold sm:text-3xl">
              Works offline
            </h3>
            <p className="mt-2 text-lg">
              Apps built with Instant keep working when you lose connection.
              When your users get back online, everything syncs up without them
              having to do a thing. Pure magic.
            </p>
            <p className="mt-4 text-sm font-medium text-gray-400">
              Variant 1: Check-ins
            </p>
          </div>
          <div className="col-span-2 rounded-2xl bg-gray-50 px-20 py-9">
            <OfflineDemoRevived />
          </div>
        </div>

        <hr className="my-16 border-gray-200" />

        {/* Variant 2: Messages */}
        <div className="grid grid-cols-3 items-center gap-6">
          <div className="col-span-1">
            <h3 className="text-2xl font-semibold sm:text-3xl">
              Works offline
            </h3>
            <p className="mt-2 text-lg">
              Apps built with Instant keep working when you lose connection.
              When your users get back online, everything syncs up without them
              having to do a thing. Pure magic.
            </p>
            <p className="mt-4 text-sm font-medium text-gray-400">
              Variant 2: Reactions
            </p>
          </div>
          <div className="col-span-2 rounded-2xl bg-gray-50 px-20 py-9">
            <OfflineDemoReactions />
          </div>
        </div>
      </div>
    </div>
  );
}
