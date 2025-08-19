import { execSync } from 'child_process';
import path from 'path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import fs from 'fs-extra';

const isGitInstalled = (dir: string): boolean => {
  try {
    execSync('git --version', { cwd: dir });
    return true;
  } catch {
    return false;
  }
};

export const isRootGitRepo = (dir: string): boolean => {
  return fs.existsSync(path.join(dir, '.git'));
};

export const isInsideGitRepo = async (dir: string): Promise<boolean> => {
  try {
    // If this command succeeds, we're inside a git repo
    await execa('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dir,
      stdout: 'ignore',
    });
    return true;
  } catch {
    // Else, it will throw a git-error and we return false
    return false;
  }
};

const getGitVersion = () => {
  const stdout = execSync('git --version').toString().trim();
  const gitVersionTag = stdout.split(' ')[2];
  const major = gitVersionTag?.split('.')[0];
  const minor = gitVersionTag?.split('.')[1];
  return { major: Number(major), minor: Number(minor) };
};

const getDefaultBranch = () => {
  const stdout = execSync('git config --global init.defaultBranch || echo main')
    .toString()
    .trim();

  return stdout;
};

// This initializes the Git-repository for the project
export const initializeGit = async (projectDir: string) => {
  if (!isGitInstalled(projectDir)) {
    p.log.warn('Git is not installed. Skipping Git initialization.');
    return;
  }

  const gitSpinner = p.spinner();
  gitSpinner.start('Initializing Git...');

  const isRoot = isRootGitRepo(projectDir);
  const isInside = await isInsideGitRepo(projectDir);
  const dirName = path.parse(projectDir).name; // skip full path for logging

  if (isInside && isRoot) {
    gitSpinner.stop();
    const overwriteGit = await p.confirm({
      message: `${chalk.redBright.bold(
        'Warning:',
      )} Git is already initialized in "${dirName}". Initializing a new git repository would delete the previous history. Would you like to continue anyways?`,
      initialValue: false,
    });

    if (!overwriteGit) {
      gitSpinner.stop('Skipping Git initialization.');
      return;
    }

    fs.removeSync(path.join(projectDir, '.git'));
  } else if (isInside && !isRoot) {
    gitSpinner.stop();
    const initializeChildGitRepo = await p.confirm({
      message: `${chalk.redBright.bold(
        'Warning:',
      )} "${dirName}" is already in a git worktree. Would you still like to initialize a new git repository in this directory?`,
      initialValue: false,
    });
    if (!initializeChildGitRepo) {
      gitSpinner.stop('Skipping Git initialization.');
      return;
    }
  }

  try {
    const branchName = getDefaultBranch();

    const { major, minor } = getGitVersion();
    if (major < 2 || (major == 2 && minor < 28)) {
      await execa('git', ['init'], { cwd: projectDir });
      await execa('git', ['symbolic-ref', 'HEAD', `refs/heads/${branchName}`], {
        cwd: projectDir,
      });
    } else {
      await execa('git', ['init', `--initial-branch=${branchName}`], {
        cwd: projectDir,
      });
    }
    await execa('git', ['add', '.'], { cwd: projectDir });
    await execa(
      'git',
      ['commit', '-m', 'Initial commit (create-instant-app)'],
      {
        cwd: projectDir,
      },
    );
    gitSpinner.stop(
      `${chalk.green('Successfully initialized and staged')} ${chalk.green.bold(
        'git',
      )}`,
    );
  } catch {
    // Safeguard, should be unreachable
    gitSpinner.stop(
      `${chalk.bold.red(
        'Failed:',
      )} could not initialize git. Update git to the latest version!`,
    );
  }
};
