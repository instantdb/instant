'use client';

import { LandingContainer, MainNav, Link } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';

const jobListings = [
  {
    title: 'Backend Engineer',
    href: '/hiring/backend-engineer',
    description:
      'Solve hard database problems and build infrastructure to handle 100k+ connections.',
  },
];

export default function Content() {
  return (
    <LandingContainer>
      <div className="relative">
        <TopWash className="bg-[#F2F0ED]" />
        <MainNav />
        <div className="relative mx-auto max-w-4xl px-4 pt-28 pb-8 sm:pt-32">
          <div className="mx-auto mb-8 max-w-2xl">
            <h1 className="mb-4 text-5xl leading-tight font-normal tracking-tight">
              Build the future of front-end tech.
            </h1>
          </div>
<div className="prose prose-lg prose-headings:font-normal prose-headings:leading-snug prose-h2:mb-3 prose-h2:mt-8 mx-auto max-w-2xl">
            <p>
              We're a YC S22 company building the infrastructure for
              applications of the future. Our team values high-integrity,
              optimistic, and principle-oriented hackers who love what they do.
            </p>
            <p>
              We've raised from top investors like Paul Graham, Greg Brockman,
              and James Tamplin (the original CEO of Firebase).
            </p>
            <p>
              We're looking for talented individuals interested in solving some
              of the hardest problems in real-time databases and front-end
              technology. If you love building delightful developer experiences
              and want to work on cutting-edge tech, we want to hear from you!
            </p>

            <h2>Open Positions</h2>
            <div className="not-prose -mx-6 mt-6 flex flex-col gap-6">
              {jobListings.map((job) => (
                <Link key={job.href} href={job.href} className="no-underline">
                  <div className="rounded-md border border-gray-200 bg-white p-6 shadow-xs transition-all hover:shadow-md">
                    <div className="mb-2 text-xl font-medium text-gray-900">
                      {job.title}
                    </div>
                    <p className="text-gray-600">{job.description}</p>
                    <div className="mt-4">
                      <span className="inline-flex items-center justify-center rounded-lg border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700">
                        View Role
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <p className="mt-6">
              Don't see a relevant role? If none of the current roles fit your
              expertise but you're still interested in joining us, we would love
              to hear from you anyway! Please feel free to{' '}
              <a
                href="mailto:founders@instantdb.com"
                className="font-normal text-orange-600 underline underline-offset-2 hover:text-orange-700"
              >
                reach out
              </a>{' '}
              :)
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </LandingContainer>
  );
}
