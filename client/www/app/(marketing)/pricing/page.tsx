import type { Metadata } from 'next';
import * as og from '@/lib/og';
import Content from './content';

export const metadata: Metadata = {
  title: 'Instant Pricing',
  openGraph: {
    images: [{ url: og.url({ section: 'pricing' }) }],
  },
};

export default function Page() {
  return <Content />;
}
