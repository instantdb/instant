import type { Metadata } from 'next';
import * as og from '@/lib/og';
import Content from './content';

const title = "We're Hiring! | InstantDB";

export const metadata: Metadata = {
  title,
  openGraph: {
    images: [{ url: og.url({ title, section: 'hiring' }) }],
  },
};

export default function Page() {
  return <Content />;
}
