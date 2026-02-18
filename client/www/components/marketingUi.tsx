'use client';
import { useAuthToken } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/solid';
import clsx from 'clsx';
import NextLink from 'next/link';
import { PropsWithChildren, useEffect, useState } from 'react';
import { Button, cn } from '@/components/ui';
import { LogoIcon } from '@instantdb/components';
import { useReadyRouter } from './clientOnlyPage';
import { useRouter } from 'next/router';

const headingClasses = `font-mono`;

export const HeadingBrand = ({ children }: PropsWithChildren) => (
  <h1 className={clsx(headingClasses, 'font-bold', 'text-[20px]')}>
    {children}
  </h1>
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
  <section className={clsx('landing-width mx-auto')}>{children}</section>
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

export const TextLink: React.FC<
  PropsWithChildren<{ href: string; target?: string }>
> = ({ children, href, target }) => (
  <NextLink href={href} className="underline" target={target}>
    {children}
  </NextLink>
);

const NavLink: React.FC<PropsWithChildren<{ href: string }>> = ({
  href,
  children,
}) => {
  // add an underline if the link is active
  const router = useRouter();
  const pathname = router.pathname;
  return (
    <NextLink
      href={href}
      className={cn(
        'whitespace-nowrap decoration-black/20 hover:text-blue-500',
        pathname === href ? 'underline' : '',
      )}
    >
      {children}
    </NextLink>
  );
};

export function LogoType() {
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
      {/*<NavLink href="/product">Product</NavLink>*/}
      <NavLink href="/enterprise">Enterprise</NavLink>
      <NavLink href="/pricing">Pricing</NavLink>
      <NavLink href="/tutorial">Tutorial</NavLink>
      <NavLink href="/examples">Examples</NavLink>
      <NavLink href="/recipes">Recipes</NavLink>
      <NavLink href="/docs">Docs</NavLink>
      <NavLink href="/essays">Essays</NavLink>
      <NavLink href="/about">About</NavLink>
    </>
  );
}

function OtherNavItems() {
  const isHydrated = useIsHydrated();
  const isAuthed = !!useAuthToken();
  if (!isHydrated) return null;
  return (
    <>
      <NavLink href="https://github.com/instantdb/instant">
        <span className="bg-secondary-fill border-secondary-border flex items-center gap-1 rounded-[5px] border p-1 px-3 text-sm transition-shadow hover:text-black hover:shadow">
          <img
            src={'img/github-icon.svg'}
            alt="GitHub"
            className="h-[18px] w-[18px]"
          />
          <span className="pl-1 font-semibold">9.6k</span>
          stars
        </span>
      </NavLink>
      {isAuthed ? (
        <div>
          <Button variant="cta" className="" type="link" href="/dash">
            Dashboard
          </Button>
        </div>
      ) : (
        <Link
          className={cn(
            'whitespace-nowrap decoration-black/20 hover:text-blue-500',
          )}
          href="/dash"
        >
          Sign up
        </Link>
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
    <div className="flex flex-row items-center gap-[24px] text-lg md:text-base">
      <LogoType />
      <button className="min-[60rem]:hidden" onClick={() => setIsOpen(true)}>
        <Bars3Icon height={'1em'} />
      </button>
      <div
        onClick={() => setIsOpen(false)}
        className={cn(
          // viz
          'hidden min-[60rem]:flex',
          // pos
          'fixed inset-0 z-40 min-[60rem]:relative',
          // scroll
          'overflow-y-scroll min-[60rem]:overflow-y-auto',
          // size
          'h-full w-full min-[60rem]:h-12 min-[60rem]:w-auto',
          // layout
          'grow flex-col items-start gap-4 px-8 py-4 min-[60rem]:flex-row min-[60rem]:items-center min-[60rem]:justify-between min-[60rem]:gap-4 min-[60rem]:p-0',
          // look and feel
          'bg-white/90 backdrop-blur-xl min-[60rem]:bg-transparent',
          {
            flex: isOpen,
          },
        )}
      >
        <div className="flex justify-between self-stretch min-[60rem]:hidden">
          <LogoType />
          <button className="z-50 mt-0.5" onClick={() => setIsOpen(false)}>
            <XMarkIcon height="1em" />
          </button>
        </div>

        {children}
        <div className="flex items-center gap-5 pt-[2px] pl-2">
          <NavItems />
        </div>
        <div className="flex items-center gap-4">
          <OtherNavItems />
        </div>
      </div>
    </div>
  );
}

export function MainNav() {
  return (
    <div className="py-4">
      <div className="landing-width mx-auto">
        <BareNav />
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
      <SectionWide>
        <hr className="h-px border-0 bg-gray-200" />
        <div className="flex flex-col gap-2 py-6">
          <div
            className={clsx(
              `flex flex-col gap-6 md:flex-row md:justify-between`,
            )}
          >
            <div className="flex flex-col gap-2 md:gap-0">
              <div>Instant</div>
              <div>Engineered in San Francisco</div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <NavLink href="/hiring">Hiring</NavLink>
              <NavLink href="https://discord.com/invite/VU53p7uQcE">
                Discord
              </NavLink>
              <NavLink href="https://github.com/instantdb/instant">
                GitHub
              </NavLink>
              <NavLink href="/status">Status</NavLink>
              <NavLink href="/privacy">Privacy Policy</NavLink>
              <NavLink href="/terms">Terms</NavLink>
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
    <div className="fixed top-0 right-0 left-0 z-50 h-0.5 bg-gray-200">
      <div
        className="h-full bg-orange-600 transition-all duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
