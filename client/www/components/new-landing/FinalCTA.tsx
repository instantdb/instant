'use client';

import { AnimateIn } from './AnimateIn';
import Link from 'next/link';
import { CopyToClipboardButton } from './CopyToClipboardButton';
import { SectionSubtitle, SectionTitle } from './typography';

export function FinalCTA() {
  return (
    <div className="text-center">
      <AnimateIn>
        <SectionTitle>Ship something delightful.</SectionTitle>
      </AnimateIn>

      <AnimateIn delay={100}>
        <SectionSubtitle>
          You can start building out your dreams today. We never limit or freeze
          your projects.
        </SectionSubtitle>
      </AnimateIn>

      <AnimateIn delay={200}>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <div className="inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-mono text-base sm:text-lg">
            <span className="text-orange-600">$</span>
            <span className="text-gray-700">npx create-instant-app</span>
            <CopyToClipboardButton text="npx create-instant-app" />
          </div>

          <span className="text-base text-gray-400">or</span>

          <Link href="/dash">
            <button className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-orange-700 sm:text-lg">
              Sign up now
            </button>
          </Link>
        </div>
      </AnimateIn>
    </div>
  );
}
