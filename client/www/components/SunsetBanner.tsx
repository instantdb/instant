'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isSelfHosted } from '@/lib/config';

export const sunsetPostPath = '/essays/instant_team_joins_openai';

// The home page announces the news in its hero, and the post is the news
const hiddenPaths = ['/', sunsetPostPath];

export function SunsetBanner() {
  const pathname = usePathname();
  if (isSelfHosted || !pathname || hiddenPaths.includes(pathname)) return null;

  return (
    <Link
      href={sunsetPostPath}
      className="block border-b border-orange-200 bg-orange-50 px-4 py-2 text-center text-sm text-orange-900 transition-colors hover:bg-orange-100"
    >
      <span className="font-semibold">The Instant Team is joining OpenAI.</span>{' '}
      Services will continue until August 31st, 2027.{' '}
      <span className="font-medium whitespace-nowrap text-orange-900/70">
        Learn more →
      </span>
    </Link>
  );
}

// In-flow variant for the docs content column: shows once per page load
// at the top of the article, then scrolls away with the content
export function SunsetDocsNotice() {
  if (isSelfHosted) return null;

  return (
    <Link
      href={sunsetPostPath}
      className="mb-4 block rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900 transition-colors hover:bg-orange-100"
    >
      <span className="font-semibold">The Instant Team is joining OpenAI.</span>{' '}
      Services will continue until August 31st, 2027.{' '}
      <span className="font-medium whitespace-nowrap text-orange-900/70">
        Learn more →
      </span>
    </Link>
  );
}
