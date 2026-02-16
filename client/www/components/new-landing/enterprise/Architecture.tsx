import { AnimateIn } from '../AnimateIn';

const stats = [
  {
    value: '< 100ms',
    label: 'to provision a new backend',
  },
  {
    value: '10k+',
    label: 'concurrent connections',
  },
  {
    value: 'Zero',
    label: 'cold starts',
  },
];

function DatabaseCylinder({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-10 w-8 ${className}`} viewBox="0 0 32 40" fill="none">
      <ellipse
        cx="16"
        cy="8"
        rx="12"
        ry="5"
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
      <path
        d="M4 8v24c0 2.76 5.37 5 12 5s12-2.24 12-5V8"
        stroke="#9ca3af"
        strokeWidth="1.5"
        fill="#f3f4f6"
      />
      <ellipse
        cx="16"
        cy="32"
        rx="12"
        ry="5"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ServerBox({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex h-8 w-10 items-center justify-center rounded border border-gray-300 bg-gray-100 ${className}`}
    >
      <svg
        className="h-4 w-4 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z"
        />
      </svg>
    </div>
  );
}

export function Architecture() {
  return (
    <div className="space-y-12">
      <AnimateIn>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          One platform, millions of backends
        </h2>
        <p className="mt-4 text-lg text-gray-500">
          Traditional backends need a VM for every app. With Instant all apps
          can live in one shared DB. Much easier and cost effective to maintain.
        </p>
      </AnimateIn>

      {/* Stat cards */}
      <AnimateIn delay={100}>
        <div className="grid grid-cols-3 gap-4 sm:gap-6">
          {stats.map((stat) => (
            <div
              key={stat.value}
              className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm sm:p-6"
            >
              <div className="text-2xl font-bold text-orange-600 sm:text-3xl lg:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 text-xs text-gray-500 sm:text-sm">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </AnimateIn>

      {/* Comparison diagram */}
      <AnimateIn delay={200}>
        <div className="grid gap-6 md:grid-cols-2 lg:gap-10">
          {/* Traditional */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-6 text-center text-sm font-medium tracking-wide text-gray-400 uppercase">
              Traditional
            </div>

            <div className="space-y-4">
              {/* Multiple separate stacks */}
              {['App 1', 'App 2', 'App 3'].map((app) => (
                <div
                  key={app}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
                >
                  <div className="flex h-8 w-16 items-center justify-center rounded border border-gray-200 bg-white">
                    <span className="text-[10px] font-medium text-gray-500">
                      {app}
                    </span>
                  </div>
                  <svg
                    className="h-4 w-4 text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                    />
                  </svg>
                  <ServerBox />
                  <svg
                    className="h-4 w-4 text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                    />
                  </svg>
                  <DatabaseCylinder />
                </div>
              ))}

              <div className="pt-2 text-center text-xs text-gray-400">
                Every app needs its own VM + database
              </div>
            </div>
          </div>

          {/* Instant */}
          <div className="rounded-xl border-2 border-orange-200 bg-orange-50/30 p-6">
            <div className="mb-6 text-center text-sm font-medium tracking-wide text-orange-600 uppercase">
              Instant
            </div>

            <div className="space-y-4">
              {/* Many apps on top */}
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-8 items-center justify-center rounded border border-orange-200 bg-white"
                  >
                    <span className="text-[8px] font-medium text-gray-400">
                      App {i + 1}
                    </span>
                  </div>
                ))}
              </div>

              {/* Connecting lines */}
              <div className="flex justify-center">
                <div className="h-6 w-px bg-orange-300" />
              </div>

              {/* Shared infrastructure */}
              <div className="rounded-lg border border-orange-300 bg-white p-4 text-center">
                <div className="mb-1 flex items-center justify-center gap-2">
                  <svg
                    className="h-5 w-5 text-orange-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                    />
                  </svg>
                  <span className="text-sm font-medium text-orange-600">
                    Shared Infrastructure
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">
                  One platform, multi-tenant
                </span>
              </div>

              <div className="pt-2 text-center text-xs text-gray-500">
                All apps share one efficient infrastructure
              </div>
            </div>
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}
