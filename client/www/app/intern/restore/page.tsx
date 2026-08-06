import type { Metadata } from 'next';
import Content from './content';

export const metadata: Metadata = {
  title: 'Restore App',
};

export default function Page() {
  return <Content />;
}
