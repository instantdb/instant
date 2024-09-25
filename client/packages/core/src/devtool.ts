type Devtool = { dispose: () => void };

let currentDevtool: Devtool | undefined;

export function createDevtool(appId: string) {
  currentDevtool?.dispose();

  const container = createContainer();
  const toggler = createToggler(toggleView);
  const iframe = createIframe(getSrc(appId));

  function onPostMessage(event: MessageEvent) {
    if (event.source !== iframe.element.contentWindow) return;

    if (event.data?.type === "close" && container.isVisible()) {
      toggleView();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    const isToggleShortcut =
      event.shiftKey && event.ctrlKey && event.key === "0";
    const isEsc = event.key === "Escape" || event.key === "Esc";

    if (isToggleShortcut || isEsc) {
      toggleView();
    }
  }

  function toggleView() {
    if (container.isVisible()) {
      container.element.style.display = "none";
    } else {
      container.element.style.display = "block";

      // lazily render iframe on first open
      if (!container.element.contains(iframe.element)) {
        container.element.appendChild(iframe.element);
      }
    }
  }

  function dispose() {
    container.element.remove();
    toggler.element.remove();
    removeEventListener("keydown", onKeyDown);
    removeEventListener("message", onPostMessage);
  }

  function create() {
    document.body.appendChild(container.element);
    document.body.appendChild(toggler.element);
    addEventListener("keydown", onKeyDown);
    addEventListener("message", onPostMessage);

    currentDevtool = {
      dispose,
    };
  }

  return create();
}

function getSrc(appId: string) {
  const isDev = (window as any).DEV_DEVTOOL;

  const src = `${isDev ? "http://localhost:3000" : "https://instantdb.com"}/_devtool?appId=${appId}`;
  return src;
}

function createIframe(src: string) {
  const element = document.createElement("iframe");

  element.src = src;
  Object.assign(element.style, {
    width: "100%",
    height: "100%",
    borderRadius: "4px",
    backgroundColor: "white",
    border: "none",
  } as Partial<CSSStyleDeclaration>);
  return { element };
}

function createToggler(onClick) {
  const logoSVG = `
    <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="black"/>
      <rect x="97.0973" y="91.3297" width="140" height="330" fill="white"/>
    </svg>
  `;
  const element = document.createElement("button");
  element.innerHTML = logoSVG;
  Object.assign(element.style, {
    // pos
    position: "fixed",
    bottom: "24px",
    left: "24px",
    height: "32px",
    width: "32px",
    // layout
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // look
    padding: "0",
    margin: "0",
    border: "none",
    cursor: "pointer",
  } as Partial<CSSStyleDeclaration>);
  element.addEventListener("click", onClick);
  return { element };
}

function createContainer() {
  const element = document.createElement("div");
  Object.assign(element.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    left: "60px",
    top: "72px",
    display: "block",
    borderRadius: "4px",
    border: "1px #ccc solid",
    boxShadow: "0px 0px 8px #00000044",
    backgroundColor: "#eee",
    zIndex: "999990",
  } as Partial<CSSStyleDeclaration>);
  element.style.display = "none";
  function isVisible() {
    return element.style.display !== "none";
  }
  return { element, isVisible };
}
