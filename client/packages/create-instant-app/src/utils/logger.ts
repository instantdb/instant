import chalk from 'chalk';
import { Theme } from '~/terminalTheme.js';

export const getCodeColors = (theme: Theme, message: string) => {
  if (theme === 'light') {
    return chalk.bgYellowBright(message);
  } else {
    return chalk.bgBlackBright(message);
  }
};

export const wrappedWindowOutput = (
  message: string,
  printer: (message: string) => void = console.log,
  spaceAfter = false,
) => {
  const width = (process.stdout.columns || 80) - 4;

  // Split the message by newlines first
  const lines = message.split('\n');
  let isFirstLine = true;

  lines.forEach((line) => {
    if (line.length === 0) {
      if (isFirstLine) {
        printer('');
        isFirstLine = false;
      } else {
        console.log(chalk.gray('│'));
      }
      return;
    }

    for (let i = 0; i < line.length; i += width) {
      let chunk = line.slice(i, i + width);

      if (i + width < line.length && chunk.length === width) {
        chunk = chunk + '-';
      }

      if (isFirstLine) {
        printer(chunk);
        isFirstLine = false;
      } else {
        console.log(chalk.gray('│ ') + chunk);
      }
    }
  });

  if (spaceAfter) {
    console.log(chalk.gray('│'));
  }
};
