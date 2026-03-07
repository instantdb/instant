import { AgentPathsBgSoftCenterLayered } from '@/components/home/AgentPathsBgSoftCenterLayered';
import { HeroPerfPreviewScaffold } from '@/components/home/HeroPerfPreviewScaffold';
import Head from 'next/head';

export default function HeroBgLayeredPage() {
  return (
    <>
      <Head>
        <title>Hero BG Layered Preview</title>
      </Head>
      <HeroPerfPreviewScaffold
        activeHref="/home/hero-bg-layered"
        badge="Layered Trails"
        description="Static wash on its own canvas, persistent trails on a fading layer, and a small dynamic overlay for heads and intersections."
        Background={AgentPathsBgSoftCenterLayered}
      />
    </>
  );
}
