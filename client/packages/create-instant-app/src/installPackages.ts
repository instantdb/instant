import { execa } from 'execa';
import { PackageManager } from './utils/getUserPkgManager.js';
import { log, spinner } from '@clack/prompts';
import chalk from 'chalk';

export const runInstallCommand = async (
  pkgManager: PackageManager,
  projectDir: string,
) => {
  const installSpinner = spinner();
  installSpinner.start(`Installing dependencies with ${pkgManager}...`);
  const result = await execa(pkgManager, ['install'], { cwd: projectDir });
  if (result.exitCode !== 0) {
    installSpinner.stop('Failed to install dependencies!');
    log.error(result.stderr);
    process.exit(1);
  }
  installSpinner.stop(chalk.green('Successfully installed dependencies!'));
};
