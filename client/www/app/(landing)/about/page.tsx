import type { Metadata } from 'next';
import Content from './content';

export const metadata: Metadata = {
  title: 'About - InstantDB',
};

export default function Page() {
  return <Content />;
}
