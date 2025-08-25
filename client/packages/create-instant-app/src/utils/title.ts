import { intro } from '@clack/prompts';
import chalk from 'chalk';
import { Theme } from '~/terminalTheme.js';

const darkTitle = `            _           _               _
 ████████  (_)         | |             | |
 ████   █   _ _ __  ___| |_ __ _ _ _  _| |_
 ████   █  | | '_ \\/ __| __/ _\\\`| '_ \\| __|
 ████   █  | | | | \\__ \\ || (_| | | | | |_
 ████████  |_|_| |_|___/\\__\\__,_|_| |_|\\__|`;

const lightTitle = `            _           _               _
 ████████  (_)         | |             | |
 █   ████   _ _ __  ___| |_ __ _ _ _  _| |_
 █   ████  | | '_ \\/ __| __/ _\\\`| '_ \\| __|
 █   ████  | | | | \\__ \\ || (_| | | | | |_
 ████████  |_|_| |_|___/\\__\\__,_|_| |_|\\__|`;

export const renderTitle = (theme: Theme) => {
  intro(
    '\n' +
      (theme === 'dark' ? darkTitle : lightTitle)
        .split('\n')
        .map(
          (line) =>
            `${chalk.gray('│')}${chalk.hex('#EA580D').bold(' ' + line)}`,
        )
        .join('\n'),
  );
  // console.log(chalk.hex('#EA580D').bold(title));
};
