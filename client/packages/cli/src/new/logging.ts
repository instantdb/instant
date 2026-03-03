import chalk from 'chalk';
import { HashMap, Logger, Match, Option } from 'effect';

export function warn(firstArg, ...rest) {
  console.warn(chalk.yellow('[warning]') + ' ' + firstArg, ...rest);
}

export function error(firstArg, ...rest) {
  console.error(chalk.red('[error]') + ' ' + firstArg, ...rest);
}

const simpleLogger = Logger.make(({ logLevel, message, annotations }) => {
  const isSilent = HashMap.get(annotations, 'silent').pipe(Option.getOrNull);
  if (isSilent) return;
  const formattedMessage = Array.isArray(message) ? message.join(' ') : message;
  Match.value(logLevel).pipe(
    Match.tag('Info', () => console.log(formattedMessage)),
    Match.tag('Warning', () => console.warn(formattedMessage)),
    Match.tag('Error', () =>
      console.error(chalk.red('[error') + ' ' + formattedMessage),
    ),
  );
});

export const SimpleLogLayer = Logger.replace(
  Logger.defaultLogger,
  simpleLogger,
);
