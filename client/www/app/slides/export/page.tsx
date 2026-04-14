'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Slide2V2 } from '../slide-2/page';
import { Slide3 } from '../slide-3/page';
import { Slide4 } from '../slide-4/page';
import { SlideD as Slide5 } from '../slide-5/page';
import { Slide6A4 } from '../slide-6/page';
import { Slide7C2 } from '../slide-7/page';
import { Slide8D4 } from '../slide-8/page';
import { useStarCount } from '@/lib/starCountContext';
import { instantRepo } from '@/lib/config';

function GitHubStars() {
  const starCount = useStarCount(instantRepo);
  return (
    <span className="bg-secondary-fill border-secondary-border flex -rotate-[1deg] items-center gap-2 rounded-[8px] border p-2.5 px-6 text-3xl">
      <img
        src="/img/github-icon.svg"
        alt="GitHub"
        className="h-[30px] w-[30px]"
      />
      <span className="pl-1 font-semibold">10.1K+</span>
      <span>stars</span>
    </span>
  );
}

function InstantLogo() {
  return (
    <div className="flex items-center gap-3">
      <img src="/img/icon/logo-512.svg" alt="" className="h-[32px] w-[32px]" />
      <span className="font-mono text-[38px] leading-none font-semibold tracking-tight text-black lowercase">
        instant
      </span>
    </div>
  );
}

function Slide1() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: 1200, height: 675 }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '40%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <div className="mb-10">
          <GitHubStars />
        </div>
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          The best backend for
          <br />
          <span className="text-orange-600">AI-coded apps</span>
        </h2>
        <div className="mt-8 flex items-center gap-4 text-3xl text-gray-500">
          <span>Auth</span>
          <span>·</span>
          <span>Database</span>
          <span>·</span>
          <span>Permissions</span>
          <span>·</span>
          <span>Realtime</span>
          <span>·</span>
          <span>Storage</span>
        </div>
        <div className="mt-12">
          <InstantLogo />
        </div>
      </div>
    </div>
  );
}

const slideComponents: Record<string, React.ReactNode> = {
  '1': <Slide1 />,
  '2': <Slide2V2 />,
  '3': <Slide3 />,
  '4': <Slide4 />,
  '5': <Slide5 />,
  '6': <Slide6A4 />,
  '7': <Slide7C2 />,
  '8': <Slide8D4 />,
};

function ExportContent() {
  const params = useSearchParams();
  const slideId = params?.get('slide') || '1';
  const slide = slideComponents[slideId];

  if (!slide) {
    return <div>Unknown slide: {slideId}</div>;
  }

  return <div id="slide-export">{slide}</div>;
}

export default function ExportPage() {
  return (
    <>
      {/* Hide Next.js dev indicator and Instant dev logo */}
      <style>{`
        [data-nextjs-dev-overlay],
        nextjs-portal,
        #__next-build-indicator,
        [data-next-mark],
        body > div[style*="position: fixed"],
        body > img[style*="position: fixed"],
        body > a[style*="position: fixed"] {
          display: none !important;
        }
      `}</style>
      <Suspense>
        <ExportContent />
      </Suspense>
    </>
  );
}
