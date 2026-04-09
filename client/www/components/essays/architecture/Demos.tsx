import CreateAppDemo from './CreateAppDemo';
import CreationTimeDemo from './CreationTimeDemo';

export type DemoState = {
  app?: {
    id: string;
    adminToken: string;
    timeTaken: number;
    expiresMs: number;
  } | null;
};

export function Demos({
  demo,
  demoState,
  setDemoState,
}: {
  demo: string;
  demoState: DemoState;
  setDemoState: (state: DemoState) => void;
}) {
  switch (demo) {
    case 'create-app':
      return (
        <CreateAppDemo demoState={demoState} setDemoState={setDemoState} />
      );
    case 'creation-time':
      return (
        <CreationTimeDemo demoState={demoState} setDemoState={setDemoState} />
      );
    default:
      return null;
  }
}
