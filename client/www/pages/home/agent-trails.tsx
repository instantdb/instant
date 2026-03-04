import Head from 'next/head';
import { HeroBackgroundPreviewPage } from '@/components/home/HeroBackgroundPreviews';

export default function HomeAgentTrailsPage() {
  return (
    <>
      <Head>
        <title>Hero Background: Agent Trails</title>
      </Head>
      <HeroBackgroundPreviewPage variant="agent-trails" />
    </>
  );
}
