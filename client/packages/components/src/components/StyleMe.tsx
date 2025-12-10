import {
  ReactNode,
  useRef,
  useState,
  useEffect,
  createContext,
  useContext,
} from 'react';
import { createPortal } from 'react-dom';
import React from 'react';

// @ts-ignore
import myStyles from '../style.css?inline';
import { cn } from './ui';
import { useExplorerProps } from './explorer';

// Context for shadow root - used by portaled components (Dialog, Tooltip, etc.)
type ShadowRootContextType = {
  shadowRoot: ShadowRoot | null;
  container: HTMLDivElement | null;
  darkMode: boolean;
};
const ShadowRootContext = createContext<ShadowRootContextType>({
  shadowRoot: null,
  container: null,
  darkMode: false,
});

/**
 * Returns the shadow root container element for portaling components.
 * This is the container div inside the shadow root that has the dark class applied.
 */
export function useShadowRoot(): HTMLDivElement | null {
  return useContext(ShadowRootContext).container;
}

/**
 * Returns the dark mode state from the shadow root context.
 * Used by portaled components to apply dark mode styles.
 */
export function useShadowDarkMode(): boolean {
  return useContext(ShadowRootContext).darkMode;
}

export const StyleMe = ({ children }: { children: ReactNode }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRoot = useRef<ShadowRoot | null>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  const explorerProps = useExplorerProps();
  const darkMode = explorerProps.darkMode;

  // Initialize shadow DOM
  useEffect(() => {
    if (hostRef.current && !mountNode) {
      try {
        const shadow = hostRef.current.attachShadow({ mode: 'open' });
        shadowRoot.current = shadow;

        const style = document.createElement('style');
        style.textContent = myStyles;
        const container = document.createElement('div');

        container.setAttribute('class', darkMode ? 'h-full dark' : 'h-full');

        shadow.appendChild(style);
        shadow.appendChild(container);

        setMountNode(container);
      } catch (err) {}
    }
  }, [mountNode]);

  // Update dark mode class when darkMode prop changes
  useEffect(() => {
    if (mountNode) {
      mountNode.setAttribute('class', darkMode ? 'h-full dark' : 'h-full');
    }
  }, [darkMode, mountNode]);

  const contextValue = React.useMemo(
    () => ({
      shadowRoot: shadowRoot.current,
      container: mountNode,
      darkMode,
    }),
    [mountNode, darkMode],
  );

  return (
    <div ref={hostRef} style={{ height: '100%' }} className={cn('h-full')}>
      <ShadowRootContext.Provider value={contextValue}>
        {mountNode ? createPortal(children, mountNode) : null}
      </ShadowRootContext.Provider>
    </div>
  );
};
