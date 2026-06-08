export interface Logger {
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export default function createLogger(
  isEnabled: boolean,
  getStats: () => Record<string, any>,
  baseLogger: Logger = console,
): Logger {
  return {
    info: isEnabled
      ? (...args: any[]) => baseLogger.info(...args, getStats())
      : () => {},
    debug: isEnabled
      ? (...args: any[]) => baseLogger.debug(...args, getStats())
      : () => {},
    error: isEnabled
      ? (...args: any[]) => baseLogger.error(...args, getStats())
      : () => {},
  };
}
