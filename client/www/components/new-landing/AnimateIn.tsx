import { ReactNode } from 'react';

interface AnimateInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function AnimateIn({
  children,
  className = '',
}: AnimateInProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}
