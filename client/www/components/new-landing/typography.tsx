import type { ReactNode } from 'react';

export function HeroTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-9xl font-normal sm:text-5xl">{children}</h1>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-3xl leading-snug font-normal sm:text-5xl">
      {children}
    </h2>
  );
}

export function SectionSubtitle({ children }: { children: ReactNode }) {
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
