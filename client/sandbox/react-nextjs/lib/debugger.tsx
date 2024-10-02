const POLL_INTERVAL = 1000;

const state: Record<string, any> = {};

let container: HTMLDivElement;

if (typeof window !== "undefined" && !(window as any).__instantDevtool) {
  (window as any).__instantDevtool = true;

  setInterval(() => {
    initDebugger();
  }, POLL_INTERVAL);

  container = document.createElement("div");
  document.body.appendChild(container);
  Object.assign(container.style, {
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
    border: "1px solid #aaa",
    display: "flex",
    gap: "4px",
    flexDirection: "column",
    backgroundColor: "#ffffffdd",
  });
}

function initDebugger() {
  const storesMap:
    | undefined
    | Record<
        string,
        {
          _reactor: {
            _registerTraceHandler?: (
              handler: (ns: string, event: string, data: any) => void,
            ) => void;
          };
        }
      > = (globalThis as any).__instantDbStore;

  if (!storesMap) return;

  for (const [id, s] of Object.entries(storesMap)) {
    const reg = s._reactor._registerTraceHandler;
    if (!state[id] && reg) {
      state[id] = {
        dispose: reg(handler),
      };
    }
  }
}

function handler(ns: string, event: string, data: any) {
  const log = document.createElement("div");
  const logData = document.createElement("pre");

  log.textContent = `${ns} ${event}`;
  logData.textContent = JSON.stringify(data);

  Object.assign(logData.style, {
    whiteSpace: "pre-wrap",
  });

  log.appendChild(logData);
  container.appendChild(log);
}
