import path from 'path';
import fs from 'fs-extra';
import { PKG_ROOT } from './consts.js';
import { Project } from './cli.js';
import chalk from 'chalk';
import { getUserPkgManager } from './utils/getUserPkgManager.js';
import { renderUnwrap, UI } from 'instant-cli/ui';

export const scaffoldBase = async (cliResults: Project, appDir: string) => {
  const projectDir = path.resolve(process.cwd(), appDir);
  const srcDir = path.join(PKG_ROOT, `template/base/${cliResults.base}`);

  if (fs.existsSync(projectDir)) {
    if (fs.readdirSync(projectDir).length === 0) {
      UI.log(
        `${chalk.cyan.bold(cliResults.appName)} exists but is empty, continuing...`,
      );
    } else {
      const overwriteDir = await renderUnwrap(
        new UI.Select({
          promptText: `${chalk.redBright.bold('Warning:')} ${chalk.cyan.bold(
            cliResults.appName,
          )} already exists and isn't empty. How would you like to proceed?`,
          options: [
            {
              label: 'Abort installation',
              value: 'abort',
            },
            {
              label: 'Clear the directory and continue installation',
              value: 'clear',
            },
          ],
          defaultValue: 'abort',
          modifyOutput: UI.ciaModifier,
        }),
      );

      if (overwriteDir === 'abort') {
        UI.log('Aborting installation...');
        process.exit(1);
      }

      if (overwriteDir === 'clear') {
        fs.emptyDirSync(projectDir);
      }
    }
  }

  fs.copySync(srcDir, projectDir);
  fs.renameSync(
    path.join(projectDir, '_gitignore'),
    path.join(projectDir, '.gitignore'),
  );
  fs.renameSync(path.join(projectDir, '_env'), path.join(projectDir, '.env'));

  if (getUserPkgManager() === 'pnpm' && cliResults.base === 'expo') {
    fs.appendFile(
      path.join(projectDir, '.npmrc'),
      `node-linker=hoisted
enable-pre-post-scripts=true`,
    );
  }

  const scaffoldedName =
    cliResults.appName === '.' ? 'App' : chalk.cyan.bold(cliResults.appName);

  UI.log(
    `${scaffoldedName} ${chalk.green('scaffolded successfully!')}`,
    UI.ciaModifier,
  );

  return projectDir;
};
