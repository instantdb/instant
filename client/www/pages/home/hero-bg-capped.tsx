import { AgentPathsBgSoftCenterCapped } from '@/components/home/AgentPathsBgSoftCenterCapped';
import { HeroPerfPreviewScaffold } from '@/components/home/HeroPerfPreviewScaffold';
import Head from 'next/head';

export default function HeroBgCappedPage() {
  return (
    <>
      <Head>
        <title>Hero BG Capped Preview</title>
      </Head>
      <HeroPerfPreviewScaffold
        activeHref="/home/hero-bg-capped"
        badge="Capped Redraw"
        description="Single hero background instance with cached static wash, visibility gating, 30fps capping, and lighter intersection work."
        Background={AgentPathsBgSoftCenterCapped}
      />
    </>
  );
}
