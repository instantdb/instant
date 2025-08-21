import chalk from 'chalk';
import { Theme } from '~/terminalTheme.js';

export const logger = {
  error(...args: unknown[]) {
    console.log(chalk.red(...args));
  },
  warn(...args: unknown[]) {
    console.log(chalk.yellow(...args));
  },
  info(...args: unknown[]) {
    console.log(chalk.cyan(...args));
  },
  success(...args: unknown[]) {
    console.log(chalk.green(...args));
  },
};

export const getCodeColors = (theme: Theme, message: string) => {
  if (theme === 'light') {
    return chalk.bgYellowBright(message);
  } else {
    return chalk.bgBlackBright(message);
  }
};
