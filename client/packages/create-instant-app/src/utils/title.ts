import { intro } from '@clack/prompts';
import chalk from 'chalk';

const title = `            _           _               _
 ████████  (_)         | |             | |
 █   ████   _ _ __  ___| |_ __ _ _ _  _| |_
 █   ████  | | '_ \\/ __| __/ _\\\`| '_ \\| __|
 █   ████  | | | | \\__ \\ || (_| | | | | |_
 ████████  |_|_| |_|___/\\__\\__,_|_| |_|\\__|`;

export const renderTitle = () => {
  intro(
    '\n' +
      title
        .split('\n')
        .map(
          (line) =>
            `${chalk.gray('│')}${chalk.hex('#EA580D').bold(' ' + line)}`,
        )
        .join('\n'),
  );
  // console.log(chalk.hex('#EA580D').bold(title));
};
