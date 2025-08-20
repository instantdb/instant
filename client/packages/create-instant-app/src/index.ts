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

const main = async () => {
  if (!process.argv.some((arg) => ['-h', '--help'].includes(arg))) {
    renderTitle();
  }
  const results = await runCli();
  const projectDir = await scaffoldBase(results);
  addRuleFiles({ projectDir, ruleFilesToAdd: results.ruleFiles });
  await runInstallCommand(getUserPkgManager(), projectDir);
  if (results.createRepo) {
    await initializeGit(projectDir);
  }

  const appId = await tryConnectApp(results.project);
  if (appId) {
    applyEnvFile(results.project, projectDir, appId);
  }

  if (results.prompt) {
    await promptClaude(results.prompt, projectDir);
  }

  outro(`Done!`);

  console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${chalk.bgBlackBright('cd ' + results.project.appName)}
    2. Create a new app on ${chalk.underline('www.instantdb.com')}
    3. Add your APP_ID to the .env file
    4. ${chalk.bgBlackBright(getUserPkgManager() + ' run dev')}
  `);
};

main().catch((err) => {
  log.error('Aborting installation...');
  log.error(err.message);
  process.exit(1);
});
