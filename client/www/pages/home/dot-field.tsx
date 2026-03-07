import Head from 'next/head';
import { HeroBackgroundPreviewPage } from '@/components/home/HeroBackgroundPreviews';

export default function HomeDotFieldPage() {
  return (
    <>
      <Head>
        <title>Hero Background: Dot Field</title>
      </Head>
      <HeroBackgroundPreviewPage variant="dot-field" />
    </>
  );
}
