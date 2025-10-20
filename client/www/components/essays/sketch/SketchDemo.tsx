import {
  ExactCountsGrowthDemo,
  BucketVisualizer,
  MoreBucketsDemo,
  HighFrequencyDemo,
  BucketNoiseBreakdownDemo,
  SingleRowBucketsDemo,
  MoreRowsConfidenceDemo,
} from './BucketComponents';
import { Estimator } from './Estimator';

const DEMO_RENDER_FNs: Record<string, () => JSX.Element> = {
  'intro-try-sketch': () => (
    <Estimator
      initialColumns={5437}
      initialRows={5}
      examples={['chap', 'castle', 'soul', 'beetle']}
      title="Words in Wodehouse"
    />
  ),
  'exact-counts-growth': () => <ExactCountsGrowthDemo />,
  'single-row-insert': () => (
    <BucketVisualizer
      variant="insert"
      rows={1}
      columns={4}
      words={['castle', 'peer', 'wet']}
      autoPlay={true}
      stepDurationMs={400}
      maxFill={800}
      hashFunction="bias-wet"
    />
  ),
  'single-row-query': () => (
    <BucketVisualizer
      variant="query"
      rows={1}
      columns={4}
      words={['castle', 'peer', 'wet']}
      highlightWord="castle"
      showLegend={false}
      maxFill={800}
      hashFunction="bias-wet"
      note={null}
    />
  ),
  'more-buckets': () => <MoreBucketsDemo />,
  'high-frequency': () => <HighFrequencyDemo />,
  'two-rows-insert': () => (
    <BucketVisualizer
      variant="insert"
      rows={2}
      columns={4}
      words={['castle', 'peer', 'like', 'wet']}
      autoPlay={true}
      showLegend={false}
      maxFill={800}
      hashFunction="rows-of-hashes"
      note={null}
    />
  ),
  'two-rows-query': () => (
    <BucketVisualizer
      variant="query"
      rows={2}
      columns={4}
      words={['castle', 'peer', 'like', 'wet']}
      highlightWord="castle"
      showLegend={false}
      maxFill={800}
      hashFunction="rows-of-hashes"
      note={null}
    />
  ),
  'more-rows-confidence': () => <MoreRowsConfidenceDemo />,
  'single-row-buckets': () => <SingleRowBucketsDemo />,
  'bucket-noise-breakdown': () => <BucketNoiseBreakdownDemo />,
  'configurable-try-sketch': () => (
    <Estimator
      isConfigurable={true}
      initialColumns={5437}
      initialRows={5}
      examples={['chap', 'castle', 'soul', 'beetle']}
      title="Try different sizes"
    />
  ),
};

export function SketchDemo({ demo }: { demo: string }) {
  const renderFn = DEMO_RENDER_FNs[demo];
  if (!renderFn) {
    throw new Error(`Unknown demo: ${demo}`);
  }
  return renderFn();
}
