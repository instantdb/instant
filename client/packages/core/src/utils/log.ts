export interface Logger {
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export default function createLogger(
  isEnabled: boolean,
  getStats: () => Record<string, any>,
): Logger {
  return {
    info: isEnabled
      ? (...args: any[]) => console.info(...args, getStats())
      : () => {},
    debug: isEnabled
      ? (...args: any[]) => console.debug(...args, getStats())
      : () => {},
    error: isEnabled
      ? (...args: any[]) => console.error(...args, getStats())
      : () => {},
  };
}
