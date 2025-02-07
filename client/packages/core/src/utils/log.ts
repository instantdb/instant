import * as flags from './flags';

const isEnabled = flags.devBackend || flags.instantLogs;

const log = {
  info: isEnabled ? console.info.bind(console) : () => {},
  debug: isEnabled ? console.debug.bind(console) : () => {},
  error: isEnabled ? console.error.bind(console) : () => {},
};

export default log;
