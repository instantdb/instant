import type { Metadata } from 'next';
import * as og from '@/lib/og';
import Content from './content';

const title = 'Database - Instant';
const description =
  'Instant has everything you need to build web and mobile apps with your favorite LLM.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    images: [og.url({ title: 'Database', section: 'Product' })],
  },
  twitter: { card: 'summary_large_image' },
};

export default function Page() {
  return <Content />;
}
