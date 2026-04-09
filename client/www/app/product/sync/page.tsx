import type { Metadata } from 'next';
import Content from './content';

const title = 'Sync Engine - Instant';
const description =
  'Make every feature feel instant, be collaborative, and work offline. No extra code required.';

export const metadata: Metadata = {
  title,
  description,
  twitter: { card: 'summary_large_image' },
};

export default function Page() {
  return <Content />;
}
