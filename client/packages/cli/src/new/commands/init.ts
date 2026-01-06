import { Effect } from 'effect';
import { ArgsFromCommand, initDef } from '../index.js';
import { ProjectInfo } from '../context/projectInfo.js';
import { CurrentApp } from '../context/currentApp.js';

export const initCommand = Effect.fn(function* (
  opts: ArgsFromCommand<typeof initDef>,
) {
  const projectInfo = yield* ProjectInfo;
  const appinfo = yield* CurrentApp;
  console.log(projectInfo, appinfo);
});
