import path from 'path';
import fs from 'fs-extra';
import { PKG_ROOT } from './consts.js';
import * as p from '@clack/prompts';
import { CliResults } from './cli.js';
import chalk from 'chalk';

export const scaffoldBase = async (cliResults: CliResults) => {
  const projectDir = path.resolve(process.cwd(), cliResults.appName);
  const srcDir = path.join(PKG_ROOT, `template/base/${cliResults.base}`);

  const spinner = p.spinner();
  spinner.start(`Scaffolding in: ${projectDir}...`);

  if (fs.existsSync(projectDir)) {
    if (fs.readdirSync(projectDir).length === 0) {
      if (cliResults.appName !== '.')
        spinner.stop(
          `${chalk.cyan.bold(cliResults.appName)} exists but is empty, continuing...`,
        );
    } else {
      spinner.stop();
      const overwriteDir = await p.select({
        message: `${chalk.redBright.bold('Warning:')} ${chalk.cyan.bold(
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
        initialValue: 'abort',
      });

      if (p.isCancel(overwriteDir) || overwriteDir === 'abort') {
        spinner.stop('Aborting installation...');
        process.exit(1);
      }

      if (overwriteDir === 'clear') {
        spinner.stop(
          `Emptying ${chalk.cyan.bold(cliResults.appName)} and creating instant app..`,
        );
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

  const scaffoldedName =
    cliResults.appName === '.' ? 'App' : chalk.cyan.bold(cliResults.appName);

  spinner.stop(`${scaffoldedName} ${chalk.green('scaffolded successfully!')}`);

  return projectDir;
};
