const log = (() => {
  let isEnabled = false;
  if (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  ) {
    isEnabled = !!window.localStorage.getItem("loggingEnabled");
  } else {
    isEnabled = false;
  }
  function makeLogger(fnName: "info" | "debug" | "error") {
    return (...args: any[]) => {
      if (!isEnabled) return;
      console[fnName](...args);
    };
  }
  return {
    info: makeLogger("info"),
    debug: makeLogger("debug"),
    error: makeLogger("error"),
  };
})();

export default log;
