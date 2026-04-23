import chalk from 'chalk';
import ansiEscapes from 'ansi-escapes';
import { HashMap, Logger, Match, Option } from 'effect';
import supportsHyperlinks from 'supports-hyperlinks';

export function warn(firstArg: string, ...rest: any[]) {
  console.warn(chalk.yellow('[warning]') + ' ' + firstArg, ...rest);
}

export function error(firstArg: string, ...rest: any[]) {
  console.error(chalk.red('[error]') + ' ' + firstArg, ...rest);
}

const simpleLogger = Logger.make(({ logLevel, message, annotations }) => {
  const isSilent = HashMap.get(annotations, 'silent').pipe(Option.getOrNull);
  if (isSilent) return;
  const formattedMessage = Array.isArray(message) ? message : [message];
  Match.value(logLevel).pipe(
    Match.tag('Info', () => console.log(...formattedMessage)),
    Match.tag('Warning', () => console.warn(...formattedMessage)),
    Match.tag('Error', () =>
      console.error(chalk.red('[error]'), ...formattedMessage),
    ),
    Match.tag('Debug', () => console.debug(...formattedMessage)),
    Match.tag('Fatal', () =>
      console.error(chalk.red('[error]'), ...formattedMessage),
    ),
  );
});

export const SimpleLogLayer = Logger.replace(
  Logger.defaultLogger,
  simpleLogger,
);

export const link = (url: string, text?: string): string => {
  if (supportsHyperlinks.stdout) {
    return ansiEscapes.link(text ?? url, url);
  }
  return text ?? url;
};
