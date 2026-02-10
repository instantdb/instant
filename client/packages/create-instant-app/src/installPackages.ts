import { execa } from 'execa';
import { PackageManager } from './utils/getUserPkgManager.js';
import { renderUnwrap, UI } from 'instant-cli/ui';

export const runInstallCommand = async (
  pkgManager: PackageManager,
  projectDir: string,
) => {
  const result = execa(pkgManager, ['install'], { cwd: projectDir });

  const spinResult = await renderUnwrap(
    new UI.Spinner({
      promise: result,
      workingText: `Installing dependencies with ${pkgManager}...`,
      doneText: 'Successfully installed dependencies!',
      modifyOutput: UI.ciaModifier(null),
    }),
  );

  if (spinResult instanceof Error) {
    throw spinResult;
  }
  if (spinResult.exitCode !== 0) {
    UI.log(spinResult.stderr, UI.ciaModifier(null));
    process.exit(1);
  }
};
