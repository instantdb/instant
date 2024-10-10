type Debuggable = {
  _core: {
    _reactor: {
      status: string;
      _getIsOnline: () => boolean;
      _registerTraceHandler: (
        handler: (ns: string, event: string, data: any) => void,
      ) => void;
    };
  };
};

const isBrowser = typeof window !== "undefined";

let rootContainer: HTMLDivElement;
let statusContainer: HTMLDivElement;
let logsContainer: HTMLDivElement;

export function instantDebugger(d: Debuggable) {
  if (!isBrowser) return;
  if (
    // @ts-expect-error
    globalThis.__instantDebugger
  )
    return;

  // @ts-expect-error
  globalThis.__instantDebugger = true;

  rootContainer ??= document.createElement("div");
  statusContainer ??= document.createElement("div");
  logsContainer ??= document.createElement("div");

  Object.assign(logsContainer.style, {
    display: "flex",
    flex: "1",
    gap: "4px",
    flexDirection: "column",
    overflowY: "auto",
    border: "1px #eee solid",
    padding: "4px",
  });

  document.body.appendChild(rootContainer);
  rootContainer.appendChild(statusContainer);
  rootContainer.appendChild(logsContainer);

  Object.assign(rootContainer.style, debugViewRootContainerStyle);

  const reg = d._core._reactor._registerTraceHandler;

  return reg(function tranceHandler(ns: string, event: string, data: any) {
    console.log(d._core._reactor._getIsOnline());
    statusContainer.innerHTML = `${d._core._reactor._getIsOnline() ? "✅ online" : "❌ offline"} • status: ${d._core._reactor.status}`;

    const isScrolledToBottom =
      logsContainer.scrollHeight - logsContainer.clientHeight <=
      logsContainer.scrollTop + 100;

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

    logsContainer.appendChild(log);

    // scroll to bottom if already scrolled to bottom
    if (isScrolledToBottom) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  });
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
  border: "1px solid #ccc",
  backgroundColor: "#ffffffdd",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};
