import { useAuthToken } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/solid';
import clsx from 'clsx';
import NextLink from 'next/link';
import { PropsWithChildren, useEffect, useState } from 'react';
import { Button, cn, LogoIcon } from '@/components/ui';

const headingClasses = `font-mono tracking-wide leading-relaxed`;

export const HeadingBrand = ({ children }: PropsWithChildren) => (
  <h1 className={clsx(headingClasses, 'font-bold')}>{children}</h1>
);

export const H2 = ({ children }: PropsWithChildren) => (
  <h2 className={clsx(headingClasses, `text-4xl leading-normal`)}>
    {children}
  </h2>
);

export const H3 = ({ children }: PropsWithChildren) => (
  <h3 className={clsx(headingClasses, `text-2xl leading-normal`)}>
    {children}
  </h3>
);

export const H4 = ({ children }: PropsWithChildren) => (
  <h4 className={clsx(`text-xl`)}>{children}</h4>
);

export const SectionWide = ({ children }: PropsWithChildren) => (
  <section className={clsx('mx-auto max-w-7xl px-8')}>{children}</section>
);

export const Section = ({ children }: PropsWithChildren) => (
  <section className={clsx('mx-auto max-w-4xl px-8')}>{children}</section>
);

export const TwoColResponsive = ({ children }: PropsWithChildren) => (
  <div
    className={clsx(
      `flex flex-col gap-16 md:flex-row md:justify-between md:gap-6`,
    )}
  >
    {children}
  </div>
);

export const Link = NextLink;

export const TextLink: React.FC<PropsWithChildren<{ href: string }>> = ({
  children,
  href,
}) => (
  <NextLink href={href} className="underline">
    {children}
  </NextLink>
);

const NavLink: React.FC<PropsWithChildren<{ href: string }>> = ({
  href,
  children,
}) => (
  <NextLink href={href} className="hover:text-blue-500 whitespace-nowrap">
    {children}
  </NextLink>
);

function LogoType() {
  return (
    <Link href="/" className="inline-flex items-center space-x-2">
      <LogoIcon />
      <HeadingBrand>instant</HeadingBrand>
    </Link>
  );
}

function NavItems() {
  const isHydrated = useIsHydrated();
  const isAuthed = !!useAuthToken();
  if (!isHydrated) return null;
  return (
    <>
      <NavLink href="/pricing">Pricing</NavLink>
      <NavLink href="/examples">Examples</NavLink>
      <NavLink href="/essays">Essays</NavLink>
      <NavLink href="/docs">Docs</NavLink>
      <NavLink href="/hiring">Hiring</NavLink>
      <NavLink href="https://discord.com/invite/VU53p7uQcE">
        <span className="hidden md:inline">
          <img src="/marketing/discord-icon.svg" className="w-5 h-5" />
        </span>
        <span className="md:hidden">Discord</span>
      </NavLink>
      <NavLink href="https://github.com/instantdb/instant">
        <span className="hidden md:inline">
          <img src="/marketing/github-icon.svg" className="w-5 h-5" />
        </span>
        <span className="md:hidden">GitHub</span>
      </NavLink>
      {isAuthed ? (
        <div>
          <Button type="link" variant="cta" size="large" href="/dash">
            Dashboard
          </Button>
        </div>
      ) : (
        <>
          <NavLink href="/dash">Login</NavLink>
          <div>
            <Button type="link" variant="cta" size="large" href="/dash">
              Sign up
            </Button>
          </div>
        </>
      )}
    </>
  );
}

export function BareNav({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';
  }, [isOpen]);

  return (
    <div className="flex justify-between items-center flex-row gap-4 text-lg md:text-base">
      <LogoType />
      <button className="md:hidden" onClick={() => setIsOpen(true)}>
        <Bars3Icon height={'1em'} />
      </button>
      <div
        onClick={() => setIsOpen(false)}
        className={cn(
          // viz
          'hidden md:flex',
          // pos
          'fixed inset-0 z-40 md:relative',
          // scroll
          'overflow-y-scroll md:overflow-y-auto',
          // size
          'w-full md:w-auto h-full md:h-12',
          // layout
          'flex-col md:flex-row md:items-center items-start gap-6 md:gap-4 px-8 py-4 md:p-0',
          // look and feel
          'bg-white/90 backdrop-blur-xl md:bg-transparent',
          {
            flex: isOpen,
          },
        )}
      >
        <div className="md:hidden flex self-stretch justify-between">
          <LogoType />
          <button className="z-50 mt-0.5" onClick={() => setIsOpen(false)}>
            <XMarkIcon height="1em" />
          </button>
        </div>

        {children}
        <NavItems />
      </div>
    </div>
  );
}

export function MainNav({ children }: PropsWithChildren) {
  return (
    <div className="py-4">
      <div className="px-8 max-w-7xl mx-auto">
        <BareNav>{children}</BareNav>
      </div>
    </div>
  );
}

export const LandingContainer = ({ children }: PropsWithChildren) => (
  <div className="min-h-full overflow-x-hidden">{children}</div>
);

export function LandingFooter() {
  return (
    <div className="text-xs text-gray-500">
      <style jsx global>
        {`
          html,
          body {
            background-color: #f8f9fa;
          }
        `}
      </style>
      <SectionWide>
        <hr className="h-px border-0 bg-gray-200" />
        <div className="flex flex-col gap-2 py-6">
          <div
            className={clsx(
              `flex flex-col gap-6 md:flex-row md:justify-between`,
            )}
          >
            <div className="flex flex-col md:gap-0 gap-2 font-mono">
              <div>Instant</div>
              <div>Engineered in San Francisco</div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <NavLink href="/examples">Examples</NavLink>
              <NavLink href="/essays">Essays</NavLink>
              <NavLink href="/docs">Docs</NavLink>
              <NavLink href="/hiring">Hiring</NavLink>
              <NavLink href="https://discord.com/invite/VU53p7uQcE">
                Discord
              </NavLink>
              <NavLink href="https://github.com/instantdb/instant">
                GitHub
              </NavLink>
              <NavLink href="/privacy">Privacy Policy</NavLink>
              <NavLink href="/terms">Terms</NavLink>
              <NavLink href="/dash">Login</NavLink>
              <div className="text-orange-500">
                <NavLink href="/dash">Signup</NavLink>
              </div>
            </div>
          </div>
        </div>
      </SectionWide>
    </div>
  );
}

export function PageProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const scrollHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const progress = Math.min((scrolled / scrollHeight) * 100, 100);
      setProgress(progress);
    };

    window.addEventListener('scroll', updateProgress);
    updateProgress();

    return () => window.removeEventListener('scroll', updateProgress);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-gray-200">
      <div
        className="h-full bg-orange-600 transition-all duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export interface Author {
  name: string;
  url: string;
}

export interface Post {
  title: string;
  slug: string;
  date: string;
  content: string;
  authors: Author[];
  isDraft?: boolean;
  hero?: string;
  og_image?: string;
}
