import Head from 'next/head';
import Image from 'next/image';
import { MainNav } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';

const quote =
  '\u201CInstant nails the quad-fecta: offline, real-time, relational queries, and open source. At Firebase, the demand for relational queries was off the charts \u2014 it\u2019s a genuinely hard engineering problem.\u201D';

const allBackers = [
  {
    name: 'James Tamplin',
    role: 'CEO of Firebase',
    imageSrc: '/img/investors/james-tamplin.jpg',
  },
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

// Option A: James removed from grid, shown only in testimonial with photo
const backersWithoutJames = allBackers.filter(
  (b) => b.name !== 'James Tamplin',
);

function BackersGrid({
  backers,
}: {
  backers: { name: string; role: string; imageSrc: string }[];
}) {
  return (
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
  );
}

// ---------------------------------------------------------------------------
// Option A: No James in grid. Testimonial has his photo (large, rounded).
// ---------------------------------------------------------------------------
function OptionA() {
  return (
    <div className="space-y-12">
      {/* Heading */}
      <div className="text-center">
        <h3 className="text-xl font-semibold sm:text-2xl">
          Backed by the best
        </h3>
      </div>

      {/* 6-person grid (3+3) */}
      <BackersGrid backers={backersWithoutJames} />

      <div className="text-center text-sm text-gray-500">
        And 50+ technical founders from Sendbird, Panther, Segment, and more
      </div>

      {/* Testimonial with photo */}
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <Image
          src="/img/investors/james-tamplin.jpg"
          alt="James Tamplin"
          width={160}
          height={160}
          className="h-28 w-28 shrink-0 rounded-full object-cover object-center sm:h-36 sm:w-36"
        />
        <div>
          <blockquote className="text-base leading-relaxed text-gray-500 max-sm:text-center sm:text-lg">
            {quote}
          </blockquote>
          <div className="mt-4 max-sm:text-center">
            <div className="text-sm font-semibold">James Tamplin</div>
            <div className="text-xs text-gray-500">Founder of Firebase</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Option B: James stays in grid. Testimonial is a big pull-quote, no image.
// ---------------------------------------------------------------------------
function OptionB() {
  return (
    <div className="space-y-12">
      {/* Heading */}
      <div className="text-center">
        <h3 className="text-xl font-semibold sm:text-2xl">
          Backed by the best
        </h3>
      </div>

      {/* Full 7-person grid */}
      <BackersGrid backers={allBackers} />

      <div className="text-center text-sm text-gray-500">
        And 50+ technical founders from Sendbird, Panther, Segment, and more
      </div>

      {/* Pull-quote testimonial — no image */}
      <div className="mx-auto max-w-2xl text-center">
        <div className="relative">
          <span
            className="absolute -top-8 -left-4 font-serif text-8xl leading-none text-gray-200 select-none sm:-top-10 sm:-left-6 sm:text-9xl"
            aria-hidden="true"
          >
            &ldquo;
          </span>
          <blockquote className="relative text-lg leading-relaxed font-medium text-gray-700 sm:text-xl">
            Instant nails the quad-fecta: offline, real-time, relational
            queries, and open source. At Firebase, the demand for relational
            queries was off the charts &mdash; it&rsquo;s a genuinely hard
            engineering problem.
          </blockquote>
        </div>
        <div className="mt-5">
          <div className="text-sm font-semibold">James Tamplin</div>
          <div className="text-xs text-gray-500">Founder of Firebase</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function TamplinQuoteOptions() {
  return (
    <div className="text-off-black relative">
      <MainNav />
      <Head>
        <title>Tamplin Quote Options | Instant</title>
      </Head>

      <main className="flex-1 pt-12 pb-24">
        <div className="landing-width mx-auto">
          <h1 className="text-center text-3xl font-bold sm:text-4xl">
            Firebase Testimonial &mdash; Option Comparison
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-gray-500">
            Two approaches for featuring James Tamplin&rsquo;s quote alongside
            the backers grid.
          </p>

          {/* Option A */}
          <div className="mt-20">
            <div className="mb-2 text-center">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                Option A
              </span>
            </div>
            <p className="mx-auto mb-10 max-w-lg text-center text-sm text-gray-500">
              James removed from grid (clean 3+3). His photo + quote appear only
              in the testimonial below. No repetition.
            </p>
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm sm:p-12">
              <OptionA />
            </div>
          </div>

          {/* Option B */}
          <div className="mt-24">
            <div className="mb-2 text-center">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                Option B
              </span>
            </div>
            <p className="mx-auto mb-10 max-w-lg text-center text-sm text-gray-500">
              James stays in the grid. Testimonial is a big pull-quote with
              decorative quotation mark &mdash; no image. His face in the grid
              is enough.
            </p>
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm sm:p-12">
              <OptionB />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
