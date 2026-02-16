import { AnimateIn } from '../AnimateIn';

const steps = [
  {
    number: 1,
    caption: 'User prompts',
    detail: '"Build me a habit tracker"',
    visual: (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-start gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
            <svg
              className="h-3.5 w-3.5 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
              />
            </svg>
          </div>
          <div className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">
            Build me a habit tracker
          </div>
        </div>
      </div>
    ),
  },
  {
    number: 2,
    caption: 'AI builds the app',
    detail: 'Working preview in the chat',
    visual: (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-start gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
            <svg
              className="h-3.5 w-3.5 text-orange-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="border-b border-gray-100 bg-gray-50 px-2 py-1 text-[10px] text-gray-400">
                Preview
              </div>
              <div className="space-y-1 p-2">
                <div className="text-[10px] font-medium text-gray-700">
                  Habits
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm border border-green-500 bg-green-500" />
                  <span className="text-[10px] text-gray-500">Exercise</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm border border-gray-300" />
                  <span className="text-[10px] text-gray-500">Read</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: 3,
    caption: 'Data persists',
    detail: 'Open it tomorrow — still there',
    visual: (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Phone icon */}
          <div className="flex h-16 w-10 flex-col items-center justify-center rounded-lg border-2 border-gray-300 p-1">
            <div className="mb-1 h-0.5 w-5 rounded-full bg-gray-300" />
            <div className="w-full flex-1 space-y-0.5">
              <div className="h-1 w-full rounded-full bg-green-400" />
              <div className="h-1 w-3/4 rounded-full bg-gray-200" />
              <div className="h-1 w-full rounded-full bg-gray-200" />
            </div>
          </div>
          <div className="text-xs text-gray-500">
            <div className="font-medium text-gray-700">Next day</div>
            <div className="text-[10px]">Your data is still here</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: 4,
    caption: 'Multiplayer built in',
    detail: 'Share a link, collaborate in real-time',
    visual: (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          {/* Two avatars overlapping */}
          <div className="flex -space-x-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-100">
              <span className="text-[10px] font-medium text-blue-600">A</span>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-100">
              <span className="text-[10px] font-medium text-emerald-600">
                B
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            <div className="font-medium text-gray-700">Shared</div>
            <div className="text-[10px]">Both see the same habits</div>
          </div>
        </div>
      </div>
    ),
  },
];

export function ChatPlatforms() {
  return (
    <div className="space-y-12">
      <AnimateIn>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Turn conversations into applications
        </h2>
        <p className="mt-4 text-lg text-gray-500">
          What if every chat could have its own backend? You could turn
          conversations into personal software.
        </p>
      </AnimateIn>

      {/* 4-step storyboard */}
      <AnimateIn delay={100}>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {steps.map((step) => (
            <div key={step.number} className="space-y-3">
              {/* Number badge */}
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100">
                  <span className="text-xs font-bold text-orange-600">
                    {step.number}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {step.caption}
                </span>
              </div>

              {/* Mini illustration */}
              {step.visual}

              {/* Detail text */}
              <p className="text-xs text-gray-500">{step.detail}</p>
            </div>
          ))}
        </div>
      </AnimateIn>

      {/* Supporting detail */}
      <AnimateIn delay={200}>
        <p className="max-w-3xl text-lg text-gray-500">
          Instant&apos;s multi-tenant architecture means spinning up a new
          backend is a metadata operation — not a new database instance. You can
          create millions of backends with the same infrastructure cost as one.
        </p>
      </AnimateIn>
    </div>
  );
}
