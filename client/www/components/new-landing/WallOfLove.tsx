import Image from 'next/image';
import { AnimateIn } from './AnimateIn';

const testimonials = [
  {
    name: 'Junior Garcia',
    role: 'Creator, HeroUI',
    image: '/img/peeps/junior_garcia.jpg',
    text: 'Not only did you have the optimistic updates I was looking for, but you had the real-time updates. You handled collisions too. Basically everything we were worried about.',
  },
  {
    name: 'Simon Grimm',
    role: 'Creator, TinyHarvest',
    image: '/img/peeps/simon_grimm.jpg',
    text: 'I needed a backend that worked with React Native and could handle offline play. Instant was the only option that gave me real-time sync, offline support, and relational queries without fighting the framework.',
  },
  {
    name: 'Paul Rony',
    role: 'Co-founder, Kosmik',
    image: '/img/peeps/paul_rony.jpg',
    text: 'Instant gave us real-time collaboration out of the box. Our users drag images, text, and links onto shared moodboards and see each other\u2019s changes live \u2014 we went from months of sync engine work to shipping multiplayer in a week.',
  },
  {
    name: 'Ignacio De Haedo',
    role: 'Co-founder, Mirando',
    image: '/img/peeps/nacho.jpg',
    text: 'The real-time sync. It\u2019s the feature that reduces the most boilerplate code. It\u2019s the feature that makes the app feel like magic.',
  },
  {
    name: 'Ari Bapna',
    role: 'Engineer',
    image: '/img/peeps/ari_bapna.jpg',
    text: 'The DX is unreal. useQuery and transact are the only two concepts you need. My whole team was productive on day one.',
  },
  {
    name: 'AJ Nandi',
    role: 'Founder',
    image: '/img/peeps/aj_nandi.jpeg',
    text: 'We evaluated every real-time backend on the market. Instant was the only one that gave us relational queries AND sync. Game changer.',
  },
  {
    name: 'Hunter Morris',
    role: 'Engineer',
    image: '/img/peeps/hunter.jpeg',
    text: 'Offline mode just works. I built a field notes app and tested it on a plane. Everything synced when I landed. No extra code needed.',
  },
  {
    name: 'Sean Walker',
    role: 'Engineer',
    image: '/img/peeps/sean.png',
    text: 'I shipped three apps last month using Instant. Auth, permissions, storage \u2014 it\u2019s all just there. No more stitching together services.',
  },
  {
    name: 'Alex Reichert',
    role: 'Engineer',
    image: '/img/peeps/alex.png',
    text: 'The type safety is incredible. Schema changes propagate everywhere instantly. Our AI coding assistant generates correct Instant code every time.',
  },
];

function TestimonialCard({
  testimonial,
}: {
  testimonial: (typeof testimonials)[0];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm leading-relaxed text-gray-700">
        &ldquo;{testimonial.text}&rdquo;
      </p>
      <div className="mt-4 flex items-center gap-3">
        <Image
          src={testimonial.image}
          alt={testimonial.name}
          width={36}
          height={36}
          className="h-9 w-9 rounded-full object-cover"
        />
        <div>
          <div className="text-sm font-semibold">{testimonial.name}</div>
          <div className="text-xs text-gray-500">{testimonial.role}</div>
        </div>
      </div>
    </div>
  );
}

export function WallOfLove() {
  return (
    <div className="space-y-12">
      <AnimateIn>
        <div className="sm:text-center">
          <p className="max-w-2xl text-2xl font-semibold sm:mx-auto sm:text-3xl">
            Developers are building with Instant every day.
          </p>
        </div>
      </AnimateIn>

      <AnimateIn>
        <div className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3">
          {testimonials.map((t) => (
            <div key={t.name} className="break-inside-avoid">
              <TestimonialCard testimonial={t} />
            </div>
          ))}
        </div>
      </AnimateIn>
    </div>
  );
}
