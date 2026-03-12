import type { ReactNode } from 'react';

interface TypographyProps {
  children: ReactNode;
}

export function HeroTitle({ children }: TypographyProps) {
  return <h1 className="text-3xl font-semibold sm:text-5xl">{children}</h1>;
}

export function SectionTitle({ children }: TypographyProps) {
  return (
    <h2 className="text-3xl leading-snug font-semibold sm:text-5xl">
      {children}
    </h2>
  );
}

export function SectionSubtitle({ children }: TypographyProps) {
  return (
    <p className="mx-auto mt-6 max-w-3xl text-lg text-balance sm:text-xl">
      {children}
    </p>
  );
}

export function Subheading({ children }: { children: ReactNode }) {
  return <h3 className="text-2xl font-normal sm:text-3xl">{children}</h3>;
}

export function FeatureBody({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-lg">{children}</p>;
}

export function SectionIntro({ children }: { children: ReactNode }) {
  return <div className="sm:text-center">{children}</div>;
}
