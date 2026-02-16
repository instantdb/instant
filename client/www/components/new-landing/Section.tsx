import { ReactNode } from 'react';

interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className = '', id }: SectionProps) {
  return (
    <section id={id} className={`py-16 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export function SectionHeader({ title, description, className = '' }: SectionHeaderProps) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-lg text-gray-500">{description}</p>
      )}
    </div>
  );
}
