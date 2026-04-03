import type { Metadata } from 'next';
import Content from './content';

export const metadata: Metadata = {
  title: 'Whirlwind tour: Build a full-stack app with InstantDB',
  description: 'Build full-stack apps with InstantDB in 5-10 minutes!',
};

export default function Page() {
  return <Content />;
}
