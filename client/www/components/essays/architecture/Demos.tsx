import CreateAppDemo from './CreateAppDemo';
import CreationTimeDemo from './CreationTimeDemo';
import TodoIframeDemo from './TodoIframeDemo';
import TodoCodeDemo, { TODO_CODE_LINE_COUNT } from './TodoCodeDemo';
import FileUploadDemo from './FileUploadDemo';

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
    case 'todo-iframe':
      return (
        <TodoIframeDemo demoState={demoState} setDemoState={setDemoState} />
      );
    case 'todo-code':
      return <TodoCodeDemo demoState={demoState} />;
    case 'todo-code-line-count':
      return <>{TODO_CODE_LINE_COUNT}</>;
    case 'file-upload':
      return (
        <FileUploadDemo demoState={demoState} setDemoState={setDemoState} />
      );
    default:
      return null;
  }
}
