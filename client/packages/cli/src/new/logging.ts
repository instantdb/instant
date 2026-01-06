import chalk from 'chalk';

export function warn(firstArg, ...rest) {
  console.warn(chalk.yellow('[warning]') + ' ' + firstArg, ...rest);
}

export function error(firstArg, ...rest) {
  console.error(chalk.red('[error]') + ' ' + firstArg, ...rest);
}
