import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
  if (tab && (tab.length !== 1 || tab[0] !== 'mobile')) {
    notFound();
  }
  const activeTab = tab?.[0] === 'mobile' ? 'mobile' : 'web';

  return (
    <Content
      webApps={webMetas}
      mobileApps={mobileMetas}
      activeTab={activeTab}
    />
  );
}
