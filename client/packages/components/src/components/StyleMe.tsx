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

// TODO: Create shadow dom context for popups
type ShadowRootContextType = ShadowRoot | null;
const ShadowRootContext = createContext<ShadowRootContextType>(null);

export function useShadowRoot(): ShadowRoot | null {
  return useContext(ShadowRootContext);
}

// @ts-ignore
import myStyles from '../style.css?inline';
import { cn } from './ui';
import { useExplorerProps } from './explorer';

export const StyleMe = ({ children }: { children: ReactNode }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRoot = useRef<ShadowRoot | null>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  const explorerProps = useExplorerProps();

  useEffect(() => {
    if (hostRef.current && !mountNode) {
      try {
        const shadow = hostRef.current.attachShadow({ mode: 'open' });
        shadowRoot.current = shadow;

        const style = document.createElement('style');
        style.textContent = myStyles;
        const container = document.createElement('div');

        if (explorerProps.darkMode) {
          container.setAttribute('class', 'tw-preflight h-full dark');
        } else {
          container.setAttribute('class', 'tw-preflight h-full');
        }

        shadow.appendChild(style);
        shadow.appendChild(container);

        setMountNode(container);
      } catch (err) {}
    }
  }, [mountNode]);

  return (
    <div
      ref={hostRef}
      style={{ height: '100%' }}
      className={cn('tw-preflight h-full')}
    >
      <ShadowRootContext.Provider value={shadowRoot.current}>
        {mountNode ? createPortal(children, mountNode) : null}
      </ShadowRootContext.Provider>
    </div>
  );
};
