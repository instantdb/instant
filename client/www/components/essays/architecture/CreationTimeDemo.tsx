import { useState } from 'react';
import { type DemoState } from './Demos';
import { createDemoApp } from './createDemoApp';

export default function CreationTimeDemo({
  demoState,
  setDemoState,
}: {
  demoState: DemoState;
  setDemoState: (state: DemoState) => void;
}) {
  const [loading, setLoading] = useState(false);

  if (demoState.app) {
    return <span className="font-semibold">{demoState.app.timeTaken}ms</span>;
  }

  return (
    <button
      className="cursor-pointer font-semibold underline decoration-dotted"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const app = await createDemoApp();
          setDemoState({ app });
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? 'Creating...' : 'Click to see'}
    </button>
  );
}
