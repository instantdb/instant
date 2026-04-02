import {
  ReactNode,
  useRef,
  useState,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import React from 'react';

// @ts-ignore
import myStyles from '../style.css?inline';
import { cn } from '../cn';
import { ShadowRootContext } from './shadowRoot';
import { useExplorerProps } from './explorer';

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
