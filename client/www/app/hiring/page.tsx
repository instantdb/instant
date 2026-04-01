import type { Metadata } from 'next';
import Content from './content';

const title = "We're Hiring! | InstantDB";

export const metadata: Metadata = {
  title,
};

export default function Page() {
  return <Content />;
}
