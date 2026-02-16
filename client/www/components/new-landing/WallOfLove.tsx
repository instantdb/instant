import { AnimateIn } from './AnimateIn';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Founder, Acme Apps',
    initials: 'SC',
    color: 'bg-orange-100 text-orange-700',
    text: 'I asked Claude to build me a project management app and pointed it at Instant. Had a working app with real-time sync in 20 minutes.',
  },
  {
    name: 'Marcus Johnson',
    role: 'Senior Engineer, Versa',
    initials: 'MJ',
    color: 'bg-blue-100 text-blue-700',
    text: 'The DX is unreal. useQuery and transact are the only two concepts you need. My whole team was productive on day one.',
  },
  {
    name: 'Priya Patel',
    role: 'Indie Hacker',
    initials: 'PP',
    color: 'bg-purple-100 text-purple-700',
    text: "I shipped three apps last month using Instant. Auth, permissions, storage — it's all just there. No more stitching together services.",
  },
  {
    name: 'Alex Rivera',
    role: 'CTO, Buildkit',
    initials: 'AR',
    color: 'bg-green-100 text-green-700',
    text: 'We evaluated every real-time backend on the market. Instant was the only one that gave us relational queries AND sync. Game changer.',
  },
  {
    name: 'Emily Zhang',
    role: 'Full-stack Developer',
    initials: 'EZ',
    color: 'bg-pink-100 text-pink-700',
    text: 'Offline mode just works. I built a field notes app and tested it on a plane. Everything synced when I landed. No extra code needed.',
  },
  {
    name: 'Dan Kowalski',
    role: 'Engineering Lead, Flux',
    initials: 'DK',
    color: 'bg-amber-100 text-amber-700',
    text: 'The type safety is incredible. Schema changes propagate everywhere instantly. Our AI coding assistant generates correct Instant code every time.',
  },
  {
    name: 'Mia Thompson',
    role: 'Product Engineer',
    initials: 'MT',
    color: 'bg-teal-100 text-teal-700',
    text: 'Went from idea to production in a weekend. The CLI-first workflow means I never left my terminal. Just vibes and shipping.',
  },
  {
    name: 'Jordan Lee',
    role: 'Founder, Stackwise',
    initials: 'JL',
    color: 'bg-red-100 text-red-700',
    text: 'We power 500+ user-created apps on Instant. Each gets its own database with permissions baked in. Could not have built this on Firebase.',
  },
  {
    name: 'Ava Williams',
    role: 'Developer Advocate',
    initials: 'AW',
    color: 'bg-indigo-100 text-indigo-700',
    text: 'Every demo I build with Instant gets the same reaction: "Wait, that\'s real-time?" Yes. It always is. That\'s the whole point.',
  },
];

function TestimonialCard({
  testimonial,
}: {
  testimonial: (typeof testimonials)[0];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm leading-relaxed text-gray-600">
        {testimonial.text}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${testimonial.color}`}
        >
          {testimonial.initials}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {testimonial.name}
          </div>
          <div className="text-xs text-gray-500">{testimonial.role}</div>
        </div>
      </div>
    </div>
  );
}

export function WallOfLove() {
  return (
    <div className="space-y-12">
      {/* Section header */}
      <AnimateIn>
        <div className="sm:text-center">
          <p className="max-w-2xl text-2xl text-gray-500 sm:mx-auto sm:text-3xl">
            Developers are building with Instant every day.
          </p>
        </div>
      </AnimateIn>

      {/* Testimonial grid */}
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
