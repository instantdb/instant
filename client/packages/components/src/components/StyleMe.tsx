import { ReactNode, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import React from 'react';

// TODO: Create shadow dom context for popups

// @ts-ignore
import myStyles from '../style.css?inline';
import { cn } from './ui';

export const StyleMe = ({ children }: { children: ReactNode }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hostRef.current && !mountNode) {
      try {
        const shadow = hostRef.current.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = myStyles;
        const container = document.createElement('div');
        container.setAttribute('class', 'tw-preflight h-full');
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
      {mountNode ? createPortal(children, mountNode) : null}
    </div>
  );
};
