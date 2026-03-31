import type { Metadata } from 'next';
import { webMetas, mobileMetas } from '@/lib/examples/data';
import Content from './content';

export const metadata: Metadata = {
  title: 'InstantDB Examples',
  description: 'Learn Instant through example apps',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === 'mobile' ? 'mobile' : 'web';

  return (
    <Content
      webApps={webMetas}
      mobileApps={mobileMetas}
      activeTab={activeTab}
    />
  );
}
