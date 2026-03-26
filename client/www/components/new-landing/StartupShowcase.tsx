import Image from 'next/image';
import { AnimateIn } from './AnimateIn';
import { SectionIntro, SectionSubtitle, SectionTitle } from './typography';

const startups = [
  {
    name: 'Eden',
    url: 'https://eden.so',
    person: 'Ari Bapna',
    role: 'Founder, Eden',
    avatar: '/img/peeps/ari_bapna.jpg',
    quote:
      'Before Instant every feature we shipped came with a handoff: a frontend engineer communicated with a backend engineer. Today, everyone is a full-stack engineer. The very first piece of frontend already comes with persistence.',
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
      'When I was choosing a backend for HeroUI, I was looking for speed: I wanted creating objects, modifying them, just about every detail, to feel fast. With Instant not only did we get optimistic updates, but we got real-time updates, and collisions. Just about all the problems we were worried about came solved. At that point I do not want to use any database other than Instant.',
    demo: {
      type: 'video' as const,
      src: 'https://stream.mux.com/a6XKGHGr801qqXSiZDnKldCqiobCOZ2pDLMzSB00pv6qM/720p.mp4',
    },
  },
  // TODO: Re-enable once Paul Rony gives the green light
  // {
  //   name: 'Kosmik',
  //   url: 'https://kosmik.app',
  //   person: 'Paul Rony',
  //   role: 'Co-founder, Kosmik',
  //   avatar: '/img/peeps/paul_rony.jpg',
  //   quote:
  //     'Instant gave us real-time collaboration out of the box. Our users drag images, text, and links onto shared moodboards and see each other\u2019s changes live \u2014 we went from months of sync engine work to shipping multiplayer in a week. This is a fake testimonial.',
  //   demo: {
  //     type: 'video' as const,
  //     src: 'https://stream.mux.com/44ZuaohoH028SIEcs1MHyp7YzprJEwHwGeWrcfs9fu0200/720p.mp4',
  //   },
  // },
  {
    name: 'Prism',
    url: 'https://www.prismvideos.com',
    person: 'Alex Liu',
    role: 'Founder, Prism (YC S25)',
    avatar: '/img/startups/alex-liu.jpeg',
    quote:
      'InstantDB is the reason we are able to build applications that feel "instant" to the user. When we were using Supabase, we had to manually create optimistic updates and  struggled to keep client state in sync with the backend. InstantDB removes all of that complexity and has become our competitive advantage. That immediate responsiveness consistently gives us a better user experience than our competitors.',
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
      'Instant lets us move fast without cutting corners. The schema and permissions are a joy to work with, recovery features have saved us a couple of times, and real-time sync eliminates a ton of boilerplate. The best part? Every time we demo our WhatsApp integration and every action instantly shows up on the web dashboard, clients are in awe. And it took zero effort on our part to achieve that magic.',
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
      "InstantDB completely changed how I build Tiny Harvest. I didn't have to think about backend logic, syncing, or infrastructure - I could just focus on building the game. Real-time updates work out of the box, and everything feels incredibly smooth. As a solo dev, that's exactly what I need: less setup, more building.",
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
        <SectionIntro>
          <SectionTitle>Startups love Instant</SectionTitle>
          <SectionSubtitle>
            Some of the best developers have bet their infrastructure on
            Instant. They do it because it helps them move fast and focus on
            wowing their users.
          </SectionSubtitle>
        </SectionIntro>
      </AnimateIn>

      <div className="space-y-20">
        {startups.map((s, i) => (
          <StartupCard key={s.name} startup={s} index={i} />
        ))}
      </div>
    </div>
  );
}
