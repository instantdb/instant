export interface Logger {
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export default function createLogger(isEnabled: boolean): Logger {
  return {
    info: isEnabled ? console.info.bind(console) : () => {},
    debug: isEnabled ? console.debug.bind(console) : () => {},
    error: isEnabled ? console.error.bind(console) : () => {},
  };
}
