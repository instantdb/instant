import { Effect } from 'effect';
import { ArgsFromCommand, initDef } from '../index.js';
import { ProjectInfo } from '../context/projectInfo.js';
import { CurrentApp } from '../context/currentApp.js';
import { WithAppLayer } from '../layer.js';

export const initCommand = (options: ArgsFromCommand<typeof initDef>) =>
  Effect.gen(function* () {
    const projectInfo = yield* ProjectInfo;
    const appinfo = yield* CurrentApp;
    console.log(projectInfo, appinfo);
  }).pipe(
    Effect.provide(
      WithAppLayer({
        coerce: true,
        title: options.title,
        appId: options.app,
        packageName: options.package as any,
        applyEnv: true,
      }),
    ),
  );
