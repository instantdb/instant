import type { Metadata } from 'next';
import { webMetas, mobileMetas } from '@/lib/examples/data';
import Content from './content';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ tab: [] }, { tab: ['mobile'] }];
}

export const metadata: Metadata = {
  title: 'InstantDB Examples',
  description: 'Learn Instant through example apps',
};

export default async function Page({
  params,
}: {
  params: Promise<{ tab?: string[] }>;
}) {
  const { tab } = await params;
  const activeTab = tab?.[0] === 'mobile' ? 'mobile' : 'web';

  return (
    <Content
      webApps={webMetas}
      mobileApps={mobileMetas}
      activeTab={activeTab}
    />
  );
}
