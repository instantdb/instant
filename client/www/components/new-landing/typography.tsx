import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface TypographyProps {
  children: ReactNode;
}

export function HeroTitle({ children }: TypographyProps) {
  return <h1 className="text-3xl font-normal sm:text-5xl">{children}</h1>;
}

export function SectionTitle({ children }: TypographyProps) {
  return (
    <h2 className="text-3xl leading-snug font-normal sm:text-5xl">
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

export function Subheading({ children }: TypographyProps) {
  return <h3 className="text-2xl font-normal sm:text-3xl">{children}</h3>;
}

export function FeatureBody({ children }: TypographyProps) {
  return <p className="mt-2 text-lg">{children}</p>;
}

export function SectionIntro({ children }: TypographyProps) {
  return <div className="sm:text-center">{children}</div>;
}

const landingButtonVariants = {
  cta: 'bg-orange-600 text-white hover:bg-orange-700',
  secondary: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
};

export function LandingButton({
  href,
  variant = 'cta',
  children,
}: {
  href: string;
  variant?: keyof typeof landingButtonVariants;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-medium transition-colors sm:text-lg',
        landingButtonVariants[variant],
      )}
    >
      {children}
    </Link>
  );
}
