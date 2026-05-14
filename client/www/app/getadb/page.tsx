import type { Metadata } from 'next';
import { GetadbLanding } from './GetadbLanding';

export const metadata: Metadata = {
  title: 'getadb — give your agent a backend',
  description:
    "Your agents shouldn't have to ask for your login info to build apps. Get fresh credentials by curling getadb.",
};

export default function GetadbHome() {
  return <GetadbLanding />;
}
