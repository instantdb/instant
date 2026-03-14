import { OfflinePersistenceWalkthrough } from '@/components/product/sync/OfflinePersistenceWalkthrough';

export default function OfflinePersistenceDemo() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold">Offline Persistence</h1>
      <div className="mt-8">
        <OfflinePersistenceWalkthrough />
      </div>
    </div>
  );
}
