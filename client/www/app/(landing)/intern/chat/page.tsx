import type { Metadata } from 'next';
import Content from './content';

export const metadata: Metadata = {
  title: 'AI Chat Usage',
};

export default function Page() {
  return <Content />;
}
