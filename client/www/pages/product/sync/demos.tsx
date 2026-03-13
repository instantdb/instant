import { SyncWalkthrough } from '@/components/product/sync/SyncWalkthrough';

export default function SyncDemos() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold">Sync Demos</h1>
      <div className="mt-8">
        <h2 className="text-lg font-medium">Real-time Sync</h2>
        <SyncWalkthrough />
      </div>
    </div>
  );
}
