import { asClientOnlyPage, ClientOnly } from '@/components/clientOnlyPage';
import { NextPageWithLayout } from '../_app';
import {
  MainDashLayout,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import { Onboarding } from '@/components/dash/Onboarding';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export const OnboardingPage = () => {
  const dash = useFetchedDash();
  const router = useRouter();
  const appCreationAllowed = dash.data.sunset?.['app-creation-allowed'] ?? true;

  useEffect(() => {
    if (!appCreationAllowed) router.replace('/dash/new');
  }, [appCreationAllowed, router]);

  if (!appCreationAllowed) return null;

  return <Onboarding />;
};

const Page: NextPageWithLayout = asClientOnlyPage(OnboardingPage);
Page.getLayout = (page) => (
  <ClientOnly>
    <MainDashLayout>{page}</MainDashLayout>
  </ClientOnly>
);

export default Page;
