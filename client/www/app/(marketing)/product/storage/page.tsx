import type { Metadata } from 'next';
import * as og from '@/lib/og';
import Content from './content';

const title = 'Storage - Instant';
const description =
  'Digital content is just another table in your database. No separate service needed.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    images: [og.url({ title: 'Storage', section: 'Product' })],
  },
  twitter: { card: 'summary_large_image' },
};

export default function Page() {
  return <Content />;
}
