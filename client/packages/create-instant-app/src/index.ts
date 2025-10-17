#!/usr/bin/env node
import { runCli } from './cli.js';
import path from 'path';
import fs from 'fs-extra';
import { type PackageJson } from 'type-fest';
import { log, outro } from '@clack/prompts';
import { renderTitle } from './utils/title.js';
import { scaffoldBase } from './scaffold.js';
import { runInstallCommand } from './installPackages.js';
import { getUserPkgManager } from './utils/getUserPkgManager.js';
import chalk from 'chalk';
import { addRuleFiles } from './ruleFiles.js';
import { initializeGit } from './git.js';
import { tryConnectApp } from './login.js';
import { applyEnvFile } from './env.js';
import { detectTerminalTheme } from './terminalTheme.js';
import {
  getCodeColors,
  SHOW_CURSOR,
  wrappedWindowOutput,
} from './utils/logger.js';
import { promptClaude } from './claude.js';
import { parseNameAndPath } from './utils/validateAppName.js';
import { execa } from 'execa';

const main = async () => {
  if (
    !process.argv.some((arg) =>
      ['-h', '--help', '--version', '-V'].includes(arg),
    )
  ) {
    renderTitle();
  }

  const theme = await detectTerminalTheme();
  const project = await runCli();

  const [scopedAppName, appDir] = parseNameAndPath(project.appName);

  const pkgManager = getUserPkgManager();

  const projectDir = await scaffoldBase(project, appDir);
  addRuleFiles({
    projectDir,
    base: project.base,
    ruleFilesToAdd: project.ruleFiles,
  });

  const possibleAppTokenPair = await tryConnectApp(project);
  if (possibleAppTokenPair) {
    applyEnvFile(
      project,
      projectDir,
      possibleAppTokenPair.appId,
      possibleAppTokenPair.adminToken,
    );
  }

  await runInstallCommand(getUserPkgManager(), projectDir);

  // Update package.json with app name
  const pkgJson = fs.readJSONSync(
    path.join(projectDir, 'package.json'),
  ) as PackageJson;
  pkgJson.name = scopedAppName;
  if (pkgManager !== 'bun') {
    const { stdout } = await execa(pkgManager, ['-v'], {
      cwd: projectDir,
    });
    pkgJson.packageManager = `${pkgManager}@${stdout.trim()}`;
  }

  fs.writeJSONSync(path.join(projectDir, 'package.json'), pkgJson, {
    spaces: 2,
  });

  if (project.createRepo) {
    await initializeGit(projectDir);
  }

  if (project.prompt) {
    await promptClaude(project.prompt, projectDir);
    process.stdout.write(SHOW_CURSOR);
  }

  outro(`Done!`);

  const startScript = project.base === 'expo' ? 'start' : 'dev';

  if (possibleAppTokenPair) {
    // already linked
    console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + appDir)}
    2. ${getCodeColors(theme, getUserPkgManager() + ` run ` + startScript)}
  `);
    if (possibleAppTokenPair.approach === 'ephemeral') {
      console.log(`
  An ephemeral app has been created and added to your .env file.
  It will expire in two weeks. For a permanent app remove the .env file and use ${getCodeColors(theme, 'npx instant-cli init')}
`);
    }
  } else {
    console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + appDir)}
    2. Create a new app on ${chalk.underline('www.instantdb.com')}
    3. Add your APP_ID to the .env file
    4. ${getCodeColors(theme, getUserPkgManager() + ` run ` + startScript)}
  `);
  }
};

main().catch((err) => {
  log.error('Aborting installation...');
  wrappedWindowOutput(err.message, log.error);
  process.stdout.write(SHOW_CURSOR);
  process.exit(1);
});

// On ctrl-c, show cursor again
process.on('SIGINT', () => {
  process.stdout.write(SHOW_CURSOR);
  process.exit(0);
});
