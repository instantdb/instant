import {
  DevtoolConfig,
  DevtoolPosition,
  StrictDevtoolConfig,
} from './coreTypes.ts';
import * as flags from './utils/flags.ts';

type Devtool = { dispose: () => void };

let currentDevtool: Devtool | undefined;

export function createDevtool(appId: string, config: StrictDevtoolConfig) {
  currentDevtool?.dispose();

  const iframeContrainer = createIframeContainer(config);
  const toggler = createToggler(config, toggleView);
  const iframe = createIframe(getSrc(appId));

  function onPostMessage(event: MessageEvent) {
    if (event.source !== iframe.element.contentWindow) return;

    if (event.data?.type === 'close' && iframeContrainer.isVisible()) {
      toggleView();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    const isToggleShortcut =
      event.shiftKey && event.ctrlKey && event.key === '0';
    const isEsc = event.key === 'Escape' || event.key === 'Esc';

    if (isToggleShortcut) {
      toggleView();
    } else if (isEsc && iframeContrainer.isVisible()) {
      toggleView();
    }
  }

  function toggleView() {
    if (iframeContrainer.isVisible()) {
      iframeContrainer.element.style.display = 'none';
    } else {
      iframeContrainer.element.style.display = 'block';

      // lazily render iframe on first open
      if (!iframeContrainer.element.contains(iframe.element)) {
        iframeContrainer.element.appendChild(iframe.element);
      }
    }
  }

  function dispose() {
    iframeContrainer.element.remove();
    toggler.element.remove();
    removeEventListener('keydown', onKeyDown);
    removeEventListener('message', onPostMessage);
  }

  function create() {
    document.body.appendChild(iframeContrainer.element);
    document.body.appendChild(toggler.element);
    addEventListener('keydown', onKeyDown);
    addEventListener('message', onPostMessage);

    currentDevtool = {
      dispose,
    };
  }

  return create();
}

function getSrc(appId: string) {
  const useLocalDashboard = flags.devBackend || flags.devtoolLocalDashboard;
  const src = `${useLocalDashboard ? 'http://localhost:3000' : 'https://instantdb.com'}/_devtool?appId=${appId}`;
  return src;
}

function createIframe(src: string) {
  const element = document.createElement('iframe');

  element.src = src;
  element.className = 'instant-devtool-iframe';
  Object.assign(element.style, {
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
    border: 'none',
  } as Partial<CSSStyleDeclaration>);
  return { element };
}

function createToggler(
  config: StrictDevtoolConfig,
  onClick: (this: HTMLButtonElement, ev: MouseEvent) => any,
) {
  const logoSVG = `
    <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="black"/>
      <rect x="97.0973" y="91.3297" width="140" height="330" fill="white"/>
    </svg>
  `;
  const element = document.createElement('button');
  element.innerHTML = logoSVG;
  element.className = 'instant-devtool-toggler';
  Object.assign(element.style, {
    // pos
    position: 'fixed',
    ...cssPositionForToggler(config.position),
    height: '32px',
    width: '32px',
    // layout
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '9010',
    // look
    padding: '0',
    margin: '0',
    border: 'none',
    cursor: 'pointer',
  } as Partial<CSSStyleDeclaration>);
  element.addEventListener('click', onClick);
  return { element };
}

function cssPositionForToggler(position: DevtoolPosition) {
  switch (position) {
    case 'bottom-left':
      return { bottom: '24px', left: '24px' };
    case 'bottom-right':
      return { bottom: '24px', right: '24px' };
    case 'top-right':
      return { top: '24px', right: '24px' };
    case 'top-left':
      return { top: '24px', left: '24px' };
  }
}

function cssPositionForIframeContainer(position: DevtoolPosition) {
  switch (position) {
    case 'bottom-left':
      return { bottom: '24px', right: '24px', left: '60px', top: '72px' };
    case 'bottom-right':
      return { bottom: '24px', left: '24px', right: '60px', top: '72px' };
    case 'top-right':
      return { top: '24px', left: '24px', right: '60px', bottom: '72px' };
    case 'top-left':
      return { top: '24px', right: '24px', left: '60px', bottom: '72px' };
  }
}

function createIframeContainer(config: StrictDevtoolConfig) {
  const element = document.createElement('div');
  Object.assign(element.style, {
    position: 'fixed',
    ...cssPositionForIframeContainer(config.position),
    display: 'block',
    borderRadius: '4px',
    border: '1px #ccc solid',
    boxShadow: '0px 0px 8px #00000044',
    backgroundColor: '#eee',
    zIndex: '999990',
  } as Partial<CSSStyleDeclaration>);
  element.style.display = 'none';
  element.className = 'instant-devtool-container';
  function isVisible() {
    return element.style.display !== 'none';
  }
  return { element, isVisible };
}
