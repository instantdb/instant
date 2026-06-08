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
import { getRules, getSchema } from './utils/appConfig.js';
import { printAppCreateResult } from './utils/printAppCreateResult.js';

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

  const isPython = project.base === 'python-script';
  const pkgManager = getUserPkgManager(project.base);

  const projectDir = await scaffoldBase(project, appDir);

  addRuleFiles({
    projectDir,
    ruleFilesToAdd: project.ruleFiles,
  });

  const scaffoldMetadata = {
    template: project.base,
    aiTool: project.ruleFiles ?? 'none',
    usedAiPrompt: !!project.prompt,
    rules: getRules(projectDir),
    schema: getSchema(projectDir),
  };

  const possibleAppTokenPair = await tryConnectApp(
    // project-name -> Project Name
    // . -> Folder Name
    // @org/scoped -> Scoped
    appDir === '.' ? scopedAppName : appDir,
    project,
    scaffoldMetadata,
  );
  printAppCreateResult(possibleAppTokenPair);
  if (possibleAppTokenPair) {
    applyEnvFile(
      project,
      projectDir,
      possibleAppTokenPair.appId,
      possibleAppTokenPair.adminToken,
    );
  }

  if (isPython) {
    // Rewrite pyproject.toml's [project].name so the scaffolded project
    // identifies itself to uv by the user's chosen app name. PEP 621 names
    // disallow `@` and `/`, so flatten an npm-style scope (`@org/foo`)
    // into a hyphenated equivalent (`org-foo`).
    const pyName = scopedAppName.replace(/^@/, '').replace(/\//g, '-');
    const pyprojectPath = path.join(projectDir, 'pyproject.toml');
    const pyproject = fs.readFileSync(pyprojectPath, 'utf-8');
    fs.writeFileSync(
      pyprojectPath,
      pyproject.replace(/^name = .*$/m, `name = "${pyName}"`),
    );
  } else {
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

    await runInstallCommand(pkgManager, projectDir);
  }

  if (project.createRepo) {
    await initializeGit(projectDir);
  }

  if (project.prompt) {
    await promptClaude(project.prompt, projectDir);
    process.stdout.write(SHOW_CURSOR);
  }

  outro(`Done!`);

  if (isPython) {
    if (possibleAppTokenPair) {
      console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + appDir)}
    2. ${getCodeColors(theme, 'uv sync')}
    3. ${getCodeColors(theme, 'uv run python main.py')}

  To push schema and permissions:
    ${getCodeColors(theme, 'npx instant-cli push')}
  `);
      if (possibleAppTokenPair.approach === 'ephemeral') {
        console.log(`
  An ephemeral app has been created and added to your .env file.
  It will expire in two weeks. For a permanent app, sign in and use ${getCodeColors(theme, 'npx instant-cli claim')}
`);
      }
    } else {
      console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + appDir)}
    2. Create a new app on ${chalk.underline('www.instantdb.com')}
    3. Add your APP_ID and admin token to the .env file
    4. ${getCodeColors(theme, 'uv sync')}
    5. ${getCodeColors(theme, 'uv run python main.py')}

  To push schema and permissions:
    ${getCodeColors(theme, 'npx instant-cli push')}
  `);
    }
  } else {
    const startScript = project.base === 'expo' ? 'start' : 'dev';

    if (possibleAppTokenPair) {
      // already linked
      console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + appDir)}
    2. ${getCodeColors(theme, pkgManager + ` run ` + startScript)}
  `);
      if (possibleAppTokenPair.approach === 'ephemeral') {
        console.log(`
  An ephemeral app has been created and added to your .env file.
  It will expire in two weeks. For a permanent app, sign in and use ${getCodeColors(theme, 'npx instant-cli claim')}
`);
      }
    } else {
      console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + appDir)}
    2. Create a new app on ${chalk.underline('www.instantdb.com')}
    3. Add your APP_ID to the .env file
    4. ${getCodeColors(theme, pkgManager + ` run ` + startScript)}
  `);
    }
  }

  process.stdout.write(SHOW_CURSOR);
  process.exit(0);
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
