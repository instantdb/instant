import type { Metadata } from 'next';
import Content from './content';

export const metadata: Metadata = {
  title: 'Instant Pricing',
};

export default function Page() {
  return <Content />;
}
