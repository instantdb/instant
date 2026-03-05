import Image from 'next/image';
import { AnimateIn } from './AnimateIn';

const stats = [
  { value: '10,000+', label: 'concurrent connections' },
  { value: '1,000+', label: 'queries per second' },
  { value: '9,600+', label: 'github stars' },
];

const backers = [
  {
    name: 'Greg Brockman',
    role: 'Co-Founder of OpenAI',
    imageSrc: '/img/investors/greg-brockman.jpg',
  },
  {
    name: 'Jeff Dean',
    role: 'Chief Scientist of Google DeepMind',
    imageSrc: '/img/investors/jeff-dean.jpg',
  },
  {
    name: 'Paul Graham',
    role: 'Co-Founder of YCombinator',
    imageSrc: '/img/investors/paul-graham.jpg',
  },
  {
    name: 'Amjad Masad',
    role: 'CEO of Replit',
    imageSrc: '/img/investors/amjad-masad.jpg',
  },
  {
    name: 'Karri Saarinen',
    role: 'CEO of Linear',
    imageSrc: '/img/investors/karri-saarinen.jpg',
  },
  {
    name: 'Zach Sims',
    role: 'CEO of Codecademy',
    imageSrc: '/img/investors/zach-sims.jpg',
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
              <div className="font-mono text-2xl font-semibold tracking-tighter sm:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 font-mono text-xs text-gray-500 sm:mt-2 sm:text-sm">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </AnimateIn>

      {/* Credibility badges */}
      <AnimateIn delay={100}>
        <div>
          <div className="flex items-center justify-center gap-4 text-xs text-gray-400 sm:gap-6 sm:text-sm">
            <div className="flex items-center gap-1.5">
              <YCIcon className="h-4 w-4" />
              <span>Backed by Y Combinator</span>
            </div>
            <span className="text-gray-300">·</span>
            <div className="flex items-center gap-1.5">
              <SVAngelIcon className="h-4 w-4" />
              <span>Backed by SV Angel</span>
            </div>
            <span className="text-gray-300">·</span>
            <div className="flex items-center gap-1.5">
              <TechCrunchIcon className="h-3.5 w-3.5" />
              <span>Featured in TechCrunch</span>
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
          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-10 gap-y-10">
            {backers.map((backer) => (
              <div key={backer.name} className="w-32 text-center">
                <Image
                  src={backer.imageSrc}
                  alt={backer.name}
                  width={80}
                  height={80}
                  className="mx-auto h-16 w-16 rounded-full object-cover object-center sm:h-20 sm:w-20"
                />
                <div className="mt-3">
                  <div className="text-sm font-semibold">{backer.name}</div>
                  <div className="text-xs text-gray-500">{backer.role}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center text-sm text-gray-500">
            And 50+ technical founders from Sendbird, Panther, Segment, and more
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

function SVAngelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#1a1a1a" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        SVA
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
