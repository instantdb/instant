import type { ReactNode } from 'react';

interface TypographyProps {
  children: ReactNode;
}

export function HeroTitle({ children }: TypographyProps) {
  return <h1 className="text-9xl font-semibold sm:text-5xl">{children}</h1>;
}

export function SectionTitle({ children }: TypographyProps) {
  return <h2 className="text-2xl font-semibold sm:text-5xl">{children}</h2>;
}

export function SectionSubtitle({ children }: TypographyProps) {
  return (
    <p className="mx-auto mt-6 max-w-3xl text-xl text-balance">{children}</p>
  );
}

export function Subheading({ children }: TypographyProps) {
  return <h3 className="text-2xl font-semibold sm:text-3xl">{children}</h3>;
}

export function FeatureBody({ children }: TypographyProps) {
  return <p className="mt-2 text-lg">{children}</p>;
}

export function SectionIntro({ children }: TypographyProps) {
  return <div className="sm:text-center">{children}</div>;
}
