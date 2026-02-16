import { AnimateIn } from '../AnimateIn';

const layers = [
  {
    label: 'Agents',
    sublabel: 'Local reasoning, fewer tokens, fewer errors',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    iconPath:
      'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z',
  },
  {
    label: 'Platforms',
    sublabel: 'Multi-tenant hosting, millions of backends, same cost',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    iconPath:
      'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z',
  },
  {
    label: 'End-users',
    sublabel: 'Exposed data, extendable apps, custom UIs',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    iconPath:
      'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  },
];

export function GoodAbstractions() {
  return (
    <div className="space-y-12">
      <AnimateIn>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Good abstractions compound
        </h2>
      </AnimateIn>

      <AnimateIn delay={100}>
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-6 text-lg text-gray-500">
            <p>
              When agents use a tight abstraction, the benefits multiply at
              every level.
            </p>
            <p>
              For the agent, there&apos;s{' '}
              <span className="font-medium text-gray-900">locality</span> — it
              reasons about one interface instead of three systems. Less context
              means fewer hallucinations, fewer retries, fewer wasted tokens.
            </p>
            <p>
              For the platform, there&apos;s{' '}
              <span className="font-medium text-gray-900">efficiency</span> —
              Instant is multi-tenant, so 20,000 apps with 1 user can cost the
              same as 1 app with 20,000 users. No VMs to provision. No cold
              starts. No frozen apps.
            </p>
            <p>
              For end-users, there&apos;s{' '}
              <span className="font-medium text-gray-900">extensibility</span> —
              because Instant exposes a database-like abstraction, end-users
              with their own agents can query and extend the apps built for
              them. Applications become platforms.
            </p>
            <p className="font-medium text-gray-900">
              These advantages stack. Agents build faster. Platforms host
              cheaper. Users get more. That&apos;s what good infrastructure
              makes possible.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="w-full max-w-sm">
              {layers.map((layer, i) => (
                <div
                  key={layer.label}
                  className={`relative rounded-xl border ${layer.border} ${layer.bg} p-5 ${i > 0 ? '-mt-2' : ''}`}
                  style={{ zIndex: i + 1 }}
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`h-6 w-6 ${layer.color}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={layer.iconPath}
                      />
                    </svg>
                    <div>
                      <div className={`font-semibold ${layer.color}`}>
                        {layer.label}
                      </div>
                      <div className="text-sm text-gray-500">
                        {layer.sublabel}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}
