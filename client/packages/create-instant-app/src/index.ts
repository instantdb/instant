import { runCli } from './cli.js';
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
import { promptClaude } from './claude.js';
import { detectTerminalTheme } from './terminalTheme.js';
import { getCodeColors } from './utils/logger.js';

const main = async () => {
  const theme = await detectTerminalTheme();
  if (!process.argv.some((arg) => ['-h', '--help'].includes(arg))) {
    renderTitle(theme);
  }

  const results = await runCli();
  const projectDir = await scaffoldBase(results.project);
  addRuleFiles({ projectDir, ruleFilesToAdd: results.project.ruleFiles });
  await runInstallCommand(getUserPkgManager(), projectDir);
  if (results.project.createRepo) {
    await initializeGit(projectDir);
  }

  const possibleAppTokenPair = await tryConnectApp(results.project);
  if (possibleAppTokenPair) {
    applyEnvFile(
      results.project,
      projectDir,
      possibleAppTokenPair.appID,
      possibleAppTokenPair.adminToken,
    );
  }

  if (results.project.prompt) {
    await promptClaude(results.project.prompt, projectDir);
  }

  outro(`Done!`);

  const startScript = results.project.base === 'expo' ? 'start' : 'dev';

  if (possibleAppTokenPair) {
    // already linked
    console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + results.project.appName)}
    2. ${getCodeColors(theme, getUserPkgManager() + ` run ` + startScript)}
  `);
  } else {
    console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${getCodeColors(theme, 'cd ' + results.project.appName)}
    2. Create a new app on ${chalk.underline('www.instantdb.com')}
    3. Add your APP_ID to the .env file
    4. ${getCodeColors(theme, getUserPkgManager() + ` run ` + startScript)}
  `);
  }
};

main().catch((err) => {
  log.error('Aborting installation...');
  log.error(err.message);
  process.exit(1);
});
