import { AnimateIn } from '../AnimateIn';

function MiniApp({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-10 w-14 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm sm:h-12 sm:w-16">
        <div className="h-1.5 w-8 rounded-full bg-gray-200" />
      </div>
      <svg
        className="h-3.5 w-3.5 text-orange-500"
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
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}

export function EnterpriseHero() {
  return (
    <section className="pt-20 pb-16 sm:pt-32 sm:pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Give every chat a backend
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-balance text-gray-500 sm:text-xl">
            Instant gives agents a real database — with auth, storage,
            permissions, and real-time sync. One API call to spin up a backend.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-base font-medium text-white shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all hover:bg-orange-700 hover:shadow-[0_0_30px_rgba(234,88,12,0.45)]"
            >
              Talk to us
            </a>
            <a
              href="https://instantdb.com/docs"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-3 text-base font-medium text-gray-900 transition-all hover:bg-gray-50"
            >
              Read the docs
            </a>
          </div>
        </div>

        {/* Chat → Platform API → Apps diagram */}
        <AnimateIn delay={400}>
          <div className="mt-16 flex flex-col items-center justify-center gap-4 sm:mt-20 sm:flex-row sm:gap-6 lg:gap-10">
            {/* Chat interface */}
            <div className="w-full max-w-[240px] flex-shrink-0 sm:w-48 sm:max-w-none">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <svg
                    className="h-6 w-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                    />
                  </svg>
                  <span className="text-xs font-medium text-gray-500">
                    Chat
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  <div className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">
                    Build me a project tracker
                  </div>
                  <div className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
                    Creating your app...
                  </div>
                </div>
              </div>
            </div>

            {/* Arrow + label */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
                Platform API
              </span>
              <svg
                className="h-5 w-5 rotate-90 text-gray-300 sm:rotate-0"
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
            </div>

            {/* Apps */}
            <div className="flex gap-4">
              <MiniApp label="App 1" />
              <MiniApp label="App 2" />
              <MiniApp label="App 3" />
            </div>
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
