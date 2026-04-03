'use client';

import { AnimateIn } from './AnimateIn';
import { CopyToClipboardButton } from './CopyToClipboardButton';
import { LandingButton, SectionSubtitle, SectionTitle } from './typography';

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

          <LandingButton href="/dash">Sign up now</LandingButton>
        </div>
      </AnimateIn>
    </div>
  );
}
