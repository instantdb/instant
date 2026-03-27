import type { Metadata } from 'next';
import * as og from '@/lib/og';
import Content from './content';

const title = 'Admin SDK - Instant';
const description =
  'Use Instant on your backend with elevated permissions. Same APIs, server-side power.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    images: [og.url({ title: 'Admin SDK', section: 'Product' })],
  },
  twitter: { card: 'summary_large_image' },
};

export default function Page() {
  return <Content />;
}
