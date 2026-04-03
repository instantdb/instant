import type { Metadata } from 'next';
import Content from './content';

const title = 'Auth - Instant';
const description =
  'Users, permissions, and social logins come integrated with your data.';

export const metadata: Metadata = {
  title,
  description,
  twitter: { card: 'summary_large_image' },
};

export default function Page() {
  return <Content />;
}
