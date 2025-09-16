import { asClientOnlyPage } from '@/components/clientOnlyPage';
import { NextPageWithLayout } from '../_app';
import { MainDashLayout } from '@/components/dash/MainDashLayout';
import { Onboarding } from '@/components/dash/Onboarding';

export const OnboardingPage = () => {
  return <Onboarding />;
};

const Page: NextPageWithLayout = asClientOnlyPage(OnboardingPage);
Page.getLayout = (page) => <MainDashLayout>{page}</MainDashLayout>;

export default Page;
