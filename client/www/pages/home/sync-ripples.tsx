import Head from 'next/head';
import { HeroBackgroundPreviewPage } from '@/components/home/HeroBackgroundPreviews';

export default function HomeSyncRipplesPage() {
  return (
    <>
      <Head>
        <title>Hero Background: Sync Ripples</title>
      </Head>
      <HeroBackgroundPreviewPage variant="sync-ripples" />
    </>
  );
}
