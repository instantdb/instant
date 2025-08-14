import { runCli } from './cli.js';
import { log, outro } from '@clack/prompts';
import { renderTitle } from './utils/title.js';
import { scaffoldBase } from './scaffold.js';
import { runInstallCommand } from './installPackages.js';
import { getUserPkgManager } from './utils/getUserPkgManager.js';
import chalk from 'chalk';
import { addRuleFiles } from './ruleFiles.js';

const main = async () => {
  renderTitle();
  const results = await runCli();
  const projectDir = await scaffoldBase(results);
  addRuleFiles({ projectDir, ruleFilesToAdd: results.ruleFiles });
  await runInstallCommand(getUserPkgManager(), projectDir);
  outro(`Done!`);

  console.log(`
  🎉 Success! Your project is ready to go!

  To get started:
    1. ${chalk.bgBlackBright('cd ' + results.project.appName)}
    2. Create a new app on ${chalk.underline('instantdb.com')}
    3. Add your APP_ID to the .env file
    4. ${chalk.bgBlackBright(getUserPkgManager() + ' run dev')}
  `);
};

main().catch((err) => {
  log.error('Aborting installation...');
  log.error(err.message);
  process.exit(1);
});
