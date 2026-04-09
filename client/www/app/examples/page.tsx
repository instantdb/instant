import type { Metadata } from 'next';
import { webMetas, mobileMetas } from '@/lib/examples/data';
import Content from './showcase';

export const metadata: Metadata = {
  title: 'InstantDB Examples',
  description: 'Learn Instant through example apps',
};

export default function Page() {
  return (
    <Content webApps={webMetas} mobileApps={mobileMetas} activeTab="web" />
  );
}
