type Debuggable = {
  _core: {
    _reactor: {
      _registerTraceHandler: (
        handler: (ns: string, event: string, data: any) => void,
      ) => void;
    };
  };
};

const isBrowser = typeof window !== "undefined";

let debugViewRootContainer: HTMLDivElement;

export function instantDebugger(d: Debuggable) {
  if (!isBrowser) return;
  if (
    // @ts-expect-error
    globalThis.__instantDebugger
  )
    return;

  // @ts-expect-error
  globalThis.__instantDebugger = true;

  debugViewRootContainer ??= document.createElement("div");
  document.body.appendChild(debugViewRootContainer);

  Object.assign(debugViewRootContainer.style, debugViewRootContainerStyle);

  const reg = d._core._reactor._registerTraceHandler;

  return reg(tranceHandler);
}

function tranceHandler(ns: string, event: string, data: any) {
  const isScrolledToBottom =
    debugViewRootContainer.scrollHeight - debugViewRootContainer.clientHeight <=
    debugViewRootContainer.scrollTop + 100;

  const log = document.createElement("div");

  log.textContent = `${ns} ${event}`;

  if (data) {
    const logData = document.createElement("pre");
    logData.textContent = JSON.stringify(data);
    Object.assign(logData.style, {
      whiteSpace: "pre-wrap",
      maxHeight: "100px",
      overflowY: "auto",
      color: "#333",
      background: "#f7f7f7",
      border: "1px #eee solid",
      padding: "4px",
    });
    log.appendChild(logData);
  }

  debugViewRootContainer.appendChild(log);

  // scroll to bottom if already scrolled to bottom
  if (isScrolledToBottom) {
    debugViewRootContainer.scrollTop = debugViewRootContainer.scrollHeight;
  }
}

const debugViewRootContainerStyle = {
  position: "fixed",
  top: "10px",
  bottom: "10px",
  right: "10px",
  padding: "10px",
  zIndex: 9999,
  width: "500px",
  maxWidth: "50vw",
  fontSize: "10px",
  fontFamily: "monospace",
  overflowY: "auto",
  border: "1px solid #ccc",
  display: "flex",
  gap: "4px",
  flexDirection: "column",
  backgroundColor: "#ffffffdd",
};
