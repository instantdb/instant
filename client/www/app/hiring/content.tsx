'use client';

import { LandingContainer, MainNav } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';

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
          <div className="mx-auto mb-10 max-w-3xl">
            <img
              src="/img/hiring/hero.png"
              alt="We're hiring!"
              className="w-full"
            />
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

            <p className="mt-6">
              Interested in joining us? We would love to{' '}
              <a
                href="mailto:founders@instantdb.com"
                className="font-normal text-orange-600 underline underline-offset-2 hover:text-orange-700"
              >
                hear from you
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
