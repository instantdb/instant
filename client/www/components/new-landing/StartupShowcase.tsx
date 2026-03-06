import Image from 'next/image';
import { AnimateIn } from './AnimateIn';

const startups = [
  {
    name: 'Eden',
    url: 'https://eden.so',
    person: 'Ari Bapna',
    role: 'Founder, Eden',
    avatar: '/img/peeps/ari_bapna.jpg',
    quote:
      'The DX is unreal. useQuery and transact are the only two concepts you need. My whole team was productive on day one.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/vQSRJTGQgLuInsUJjw01klupQSKE7a00nWY4MGbcmU5Xc/720p.mp4',
    },
  },
  {
    name: 'HeroUI',
    url: 'https://heroui.com',
    person: 'Junior Garcia',
    role: 'Creator, HeroUI (YC S24)',
    avatar: '/img/peeps/junior_garcia.jpg',
    quote:
      'Not only did you have the optimistic updates I was looking for, but you had the real-time updates. You handled collisions too. Basically everything we were worried about.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/a6XKGHGr801qqXSiZDnKldCqiobCOZ2pDLMzSB00pv6qM/720p.mp4',
    },
  },
  {
    name: 'Kosmik',
    url: 'https://kosmik.app',
    person: 'Paul Rony',
    role: 'Co-founder, Kosmik',
    avatar: '/img/peeps/paul_rony.jpg',
    quote:
      'Instant gave us real-time collaboration out of the box. Our users drag images, text, and links onto shared moodboards and see each other\u2019s changes live \u2014 we went from months of sync engine work to shipping multiplayer in a week.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/44ZuaohoH028SIEcs1MHyp7YzprJEwHwGeWrcfs9fu0200/720p.mp4',
    },
  },
  {
    name: 'Prism',
    url: 'https://www.prismvideos.com',
    person: 'Alex Liu',
    role: 'Founder, Prism (YC S25)',
    avatar: '/img/startups/alex-liu.jpeg',
    quote:
      'Instant is our competitive advantage. We get real-time collaboration and offline sync without building any of the infrastructure ourselves. Features that would take months to build are just there from day one.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/QcgsuWVVwBHiHLAKeREBcfXBoQRn486KzU1YwrGfd1c/720p.mp4',
    },
  },
  {
    name: 'Mirando',
    url: 'https://mirando.com.uy',
    person: 'Ignacio De Haedo',
    role: 'Co-founder, Mirando (Ex-Facebook)',
    avatar: '/img/peeps/nacho.jpg',
    quote:
      'The real-time sync. It\u2019s the feature that reduces the most boilerplate code. It\u2019s the feature that makes the app feel like magic.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/RKonvNooP6gss8vCLxqnCVcbjzrPn01x01O00vH9bgQAX00/720p.mp4',
    },
  },
  {
    name: 'TinyHarvest',
    url: 'https://tinyharvest.app',
    person: 'Simon Grimm',
    role: 'Creator, TinyHarvest',
    avatar: '/img/peeps/simon_grimm.jpg',
    quote:
      'I needed a backend that worked with React Native and could handle offline play. Instant was the only option that gave me real-time sync, offline support, and relational queries without fighting the framework.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/DtNkCSmdCnUp00igSAeo01DCfVBeeLf1WnszJBhE2JBEQ/720p.mp4',
      portrait: true,
    },
  },
];

function AppDemo({ demo }: { demo: (typeof startups)[0]['demo'] }) {
  const isPortrait = 'portrait' in demo && demo.portrait;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shadow-sm">
      {demo.type === 'video' && isPortrait ? (
        <div
          className="flex items-center justify-center bg-gray-900 py-6"
          style={{ maxHeight: '500px' }}
        >
          <video
            src={demo.src}
            autoPlay
            loop
            muted
            playsInline
            className="h-full max-h-[460px] rounded-lg object-contain"
          />
        </div>
      ) : demo.type === 'video' ? (
        <video
          src={demo.src}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <Image
          src={demo.src}
          alt="App screenshot"
          width={800}
          height={500}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

function StartupCard({
  startup,
  index,
}: {
  startup: (typeof startups)[0];
  index: number;
}) {
  const isEven = index % 2 === 0;
  return (
    <AnimateIn>
      <div
        className={`flex flex-col gap-8 ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
      >
        <div className="min-w-0 flex-1">
          <AppDemo demo={startup.demo} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <blockquote className="text-lg leading-relaxed text-gray-700 italic">
            &ldquo;{startup.quote}&rdquo;
          </blockquote>
          <div className="mt-6 flex items-center gap-4">
            <Image
              src={startup.avatar}
              alt={startup.person}
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover"
            />
            <div>
              <div className="font-semibold">{startup.person}</div>
              <div className="text-sm text-gray-500">
                {startup.role} &middot;{' '}
                <a
                  href={startup.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-gray-800"
                >
                  {startup.name}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnimateIn>
  );
}

export function StartupShowcase() {
  return (
    <div className="space-y-16">
      <AnimateIn>
        <h2 className="text-center text-2xl font-semibold sm:text-5xl">
          Startups love Instant
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[21px]">
          From collaborative whiteboards to mobile games, teams ship real-time
          products in days instead of months.
        </p>
      </AnimateIn>

      <div className="space-y-20">
        {startups.map((s, i) => (
          <StartupCard key={s.name} startup={s} index={i} />
        ))}
      </div>
    </div>
  );
}
