import type { Metadata } from 'next';
import Content from './content';

const title = 'Founding Backend Engineer | InstantDB';

export const metadata: Metadata = {
  title,
};

export default function Page() {
  return <Content />;
}
