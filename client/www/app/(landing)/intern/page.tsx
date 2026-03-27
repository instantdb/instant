import type { Metadata } from 'next';
import Content from './content';

export const metadata: Metadata = {
  title: 'Instant Intern tools',
  description: 'Internal tools and analytics for InstantDB',
};

export default function Page() {
  return <Content />;
}
