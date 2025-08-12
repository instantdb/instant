import { runCli } from './cli.js';
import { log } from '@clack/prompts';
import { renderTitle } from './utils/title.js';

const main = async () => {
  renderTitle();
  const results = await runCli();
  log.info(`Creating ${results.project.base} project with instant...`);
};

main().catch((err) => {
  log.error('Aborting installation...');
  log.error(err);
  process.exit(1);
});
