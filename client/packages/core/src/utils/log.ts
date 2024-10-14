let isEnabled = false;
if (
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined"
) {
  isEnabled =
    !!window.localStorage.getItem("devBackend") ||
    !!window.localStorage.getItem("__instantLogging");
}

const log = {
  info: isEnabled ? console.info.bind(console) : () => {},
  debug: isEnabled ? console.debug.bind(console) : () => {},
  error: isEnabled ? console.error.bind(console) : () => {},
};

export default log;
