import type { Metadata } from 'next';
import * as og from '@/lib/og';
import Content from './content';

const title = 'Auth - Instant';
const description =
  'Users, permissions, and social logins come integrated with your data.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    images: [og.url({ title: 'Auth', section: 'Product' })],
  },
  twitter: { card: 'summary_large_image' },
};

export default function Page() {
  return <Content />;
}
