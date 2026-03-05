import Head from 'next/head';
import Image from 'next/image';
import { MainNav } from '@/components/marketingUi';
import { Section } from '@/components/new-landing/Section';
import { AnimateIn } from '@/components/new-landing/AnimateIn';
import { Footer } from '@/components/new-landing/Footer';

const startups = [
  {
    name: 'Eden',
    url: 'https://eden.so',
    person: 'Ari Bapna',
    role: 'Founder, Eden',
    avatar: '/img/peeps/ari_bapna.jpg',
    avatarLarge: '/img/startups/ari-bapna-large.jpeg',
    quote:
      'The DX is unreal. useQuery and transact are the only two concepts you need. My whole team was productive on day one.',
    demo: { type: 'video' as const, src: 'https://stream.mux.com/vQSRJTGQgLuInsUJjw01klupQSKE7a00nWY4MGbcmU5Xc/720p.mp4' },
  },
  {
    name: 'HeroUI',
    url: 'https://heroui.com',
    person: 'Junior Garcia',
    role: 'Creator, HeroUI (YC S24)',
    avatar: '/img/peeps/junior_garcia.jpg',
    avatarLarge: '/img/startups/junior-garcia-large.jpg',
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
    avatarLarge: '/img/peeps/paul_rony.jpg',
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
    avatarLarge: '/img/startups/alex-liu.jpeg',
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
    avatarLarge: '/img/peeps/nacho.jpg',
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
    avatarLarge: '/img/peeps/simon_grimm.jpg',
    quote:
      'I needed a backend that worked with React Native and could handle offline play. Instant was the only option that gave me real-time sync, offline support, and relational queries without fighting the framework.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/DtNkCSmdCnUp00igSAeo01DCfVBeeLf1WnszJBhE2JBEQ/720p.mp4',
      portrait: true,
    },
  },
];

// -- Version 1: Carousel with App Demos --

function AppDemo({ demo }: { demo: (typeof startups)[0]['demo'] }) {
  const isPortrait = 'portrait' in demo && demo.portrait;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shadow-sm">
      {demo.type === 'video' && isPortrait ? (
        <div className="flex items-center justify-center bg-gray-900 py-6" style={{ maxHeight: '500px' }}>
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
      ) : demo.type === 'vimeo' ? (
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={demo.src}
            className="absolute inset-0 h-full w-full"
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
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

function StartupCardV1({
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
        {/* App demo */}
        <div className="flex-1 min-w-0">
          <AppDemo demo={startup.demo} />
        </div>

        {/* Quote + person */}
        <div className="flex flex-1 flex-col justify-center min-w-0">
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

function Version1() {
  return (
    <Section>
      <div className="space-y-16">
        <AnimateIn>
          <h2 className="text-center text-3xl font-semibold sm:text-4xl">
            Startups use Instant for their core infra
          </h2>
        </AnimateIn>

        <div className="space-y-20">
          {startups.map((s, i) => (
            <StartupCardV1 key={s.name} startup={s} index={i} />
          ))}
        </div>
      </div>
    </Section>
  );
}

// -- Version 2: Video Testimonials (bun.sh-style) --

function StartupCardV2({ startup }: { startup: (typeof startups)[0] }) {
  return (
    <AnimateIn>
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Fake video thumbnail */}
        <div className="relative flex-1 min-w-0 overflow-hidden rounded-lg">
          <Image
            src={startup.avatarLarge}
            alt={startup.person}
            width={800}
            height={500}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            {/* Play button */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
              <svg
                className="ml-1 h-6 w-6 text-gray-800"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
            Video coming soon
          </div>
        </div>

        {/* Quote + person */}
        <div className="flex flex-1 flex-col justify-center min-w-0">
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

function Version2() {
  return (
    <Section>
      <div className="space-y-16">
        <AnimateIn>
          <h2 className="text-center text-3xl font-semibold sm:text-4xl">
            Startups use Instant for their core infra
          </h2>
        </AnimateIn>

        <div className="space-y-20">
          {startups.map((s) => (
            <StartupCardV2 key={s.name} startup={s} />
          ))}
        </div>
      </div>
    </Section>
  );
}

// -- Page --

export default function StartupShowcase() {
  return (
    <div className="text-off-black relative">
      <MainNav />
      <Head>
        <title>Startup Showcase | Instant</title>
      </Head>
      <main className="flex-1 pt-12">
        {/* Version 1 */}
        <div className="mb-4 text-center">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
            Version 1: App Demos
          </span>
        </div>
        <Version1 />

        {/* Divider */}
        <div className="landing-width mx-auto">
          <hr className="border-gray-200" />
        </div>

        {/* Version 2 */}
        <div className="mt-4 text-center">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
            Version 2: Video Testimonials
          </span>
        </div>
        <Version2 />
      </main>
      <Footer />
    </div>
  );
}
