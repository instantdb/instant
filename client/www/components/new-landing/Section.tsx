import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ReactNode } from 'react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className = '', id }: SectionProps) {
  return (
    <section id={id} className={cn('py-16 sm:py-24', className)}>
      <div className="landing-width mx-auto">{children}</div>
    </section>
  );
}
