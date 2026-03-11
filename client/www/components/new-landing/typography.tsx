import type { ElementType, ReactNode } from 'react';

interface TypographyProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

function renderWithTag(
  Tag: ElementType,
  className: string,
  children: ReactNode,
  extraClassName?: string,
) {
  return (
    <Tag
      className={extraClassName ? `${className} ${extraClassName}` : className}
    >
      {children}
    </Tag>
  );
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

export function ProminentTitle({
  children,
  as: Tag = 'h2',
  className,
}: TypographyProps) {
  return renderWithTag(
    Tag,
    'text-2xl leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current md:text-3xl',
    children,
    className,
  );
}

export function CardTitle({
  children,
  as: Tag = 'h3',
  className,
}: TypographyProps) {
  return renderWithTag(
    Tag,
    'text-lg leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current',
    children,
    className,
  );
}

export function BodyText({
  children,
  as: Tag = 'p',
  className,
}: TypographyProps) {
  return renderWithTag(
    Tag,
    'text-base leading-relaxed text-gray-500',
    children,
    className,
  );
}
