import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getFiles } from 'recipes';
import * as og from '@/lib/og';
import Content from './content';

export const metadata: Metadata = {
  title: 'Instant Recipes',
  openGraph: {
    images: [og.url({ section: 'recipes' })],
  },
};

export default function Page() {
  const files = getFiles();
  return (
    <Suspense>
      <Content files={files} />
    </Suspense>
  );
}
