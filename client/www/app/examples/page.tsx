import type { Metadata } from 'next';
import { Suspense } from 'react';
import { webMetas, mobileMetas } from '@/lib/examples/data';
import Content from './content';

export const metadata: Metadata = {
  title: 'InstantDB Examples',
  description: 'Learn Instant through example apps',
};

export default function Page() {
  return (
    <Suspense>
      <Content webApps={webMetas} mobileApps={mobileMetas} />
    </Suspense>
  );
}
