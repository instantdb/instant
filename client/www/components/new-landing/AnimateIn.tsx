'use client';

import { ReactNode } from 'react';
import { useInView } from 'react-intersection-observer';

interface AnimateInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function AnimateIn({
  children,
  delay = 0,
  className = '',
}: AnimateInProps) {
  const { ref, inView } = useInView();

  return (
    <div
      ref={ref}
      className={`motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out ${
        inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
