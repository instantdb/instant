import { AnimateIn } from './AnimateIn';

const stats = [
  { value: '10k+', label: 'Concurrent connections' },
  { value: '1k+', label: 'Queries per second' },
  { value: '10k', label: 'GitHub stars' },
];

const backers = [
  {
    name: 'James Tamplin',
    role: 'Firebase founder',
    initials: 'JT',
    color: 'bg-orange-100 text-orange-700',
  },
  {
    name: 'Greg Brockman',
    role: 'OpenAI',
    initials: 'GB',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    name: 'Jeff Dean',
    role: 'Google',
    initials: 'JD',
    color: 'bg-green-100 text-green-700',
  },
  {
    name: 'Amjad Masad',
    role: 'Replit',
    initials: 'AM',
    color: 'bg-purple-100 text-purple-700',
  },
];

export function SocialProof() {
  return (
    <div className="space-y-16">
      {/* Stats */}
      <AnimateIn>
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-4 sm:gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-semibold sm:text-7xl">
                {stat.value}
              </div>
              <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </AnimateIn>

      {/* Credibility badges */}
      <AnimateIn delay={100}>
        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <div className="flex items-center gap-2 text-gray-400">
            <YCIcon className="h-6 w-6 sm:h-8 sm:w-8" />
            <div className="text-xs sm:text-sm">
              <div className="font-semibold text-gray-600">Backed by</div>
              <div className="text-gray-400">Y Combinator</div>
            </div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex items-center gap-2 text-gray-400">
            <TechCrunchIcon className="h-5 w-5 sm:h-7 sm:w-7" />
            <div className="text-xs sm:text-sm">
              <div className="font-semibold text-gray-600">Featured in</div>
              <div className="text-gray-400">TechCrunch</div>
            </div>
          </div>
        </div>
      </AnimateIn>

      {/* Backers */}
      <AnimateIn delay={200}>
        <div>
          <div className="mb-8 text-center">
            <h3 className="text-xl font-semibold sm:text-2xl">
              Backed by the best
            </h3>
          </div>
          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            {backers.map((backer) => (
              <div key={backer.name} className="text-center">
                <div
                  className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold sm:h-20 sm:w-20 sm:text-xl ${backer.color}`}
                >
                  {backer.initials}
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold">{backer.name}</div>
                  <div className="text-xs text-gray-500">{backer.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}

function YCIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="4" fill="#F26522" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="white"
        fontSize="14"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        Y
      </text>
    </svg>
  );
}

function TechCrunchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#0A9E01" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        TC
      </text>
    </svg>
  );
}
