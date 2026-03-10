'use client';
import { useAuthToken } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/solid';
import {
  ChevronDownIcon,
  CircleStackIcon,
  LockClosedIcon,
  ArrowPathIcon,
  FolderIcon,
  CodeBracketIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import NextLink from 'next/link';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, cn, LogoIcon } from '@/components/ui';
import { ComponentType, SVGProps } from 'react';
import { useRouter } from 'next/router';

type Product = {
  id: string;
  name: string;
  tagline: string;
};

const products: Product[] = [
  {
    id: 'database',
    name: 'Database',
    tagline:
      'Everything you need to build web and mobile apps with your favorite LLM.',
  },
  {
    id: 'auth',
    name: 'Auth',
    tagline: 'No split brain. Easy setup. Fine-grained access control.',
  },
  {
    id: 'sync',
    name: 'Sync Engine',
    tagline:
      'Every feature feels instant, is collaborative, and works offline.',
  },
  {
    id: 'storage',
    name: 'Storage',
    tagline: 'Digital content is just another table in your database.',
  },
  {
    id: 'admin-sdk',
    name: 'Admin SDK',
    tagline: 'Use Instant on your backend',
  },
];

const productIcons: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  database: CircleStackIcon,
  auth: LockClosedIcon,
  sync: ArrowPathIcon,
  storage: FolderIcon,
  'admin-sdk': CodeBracketIcon,
};

export function ProductNav({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="hidden border-b border-gray-200 py-3 min-[60rem]:block">
      <div className="mx-auto max-w-7xl px-8">
        <div className="flex justify-center">
          <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
            {products.map((product) => {
              const Icon = productIcons[product.id];
              return (
                <Link
                  key={product.id}
                  href={`/product/${product.id}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all',
                    product.id === currentSlug
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {product.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

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

export const Section = ({ children }: PropsWithChildren) => (
  <section className={clsx('landing-width mx-auto')}>{children}</section>
);

export const SectionWide = ({ children }: PropsWithChildren) => (
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
  const router = useRouter();
  const pathname = router.pathname;
  return (
    <NextLink
      href={href}
      className={cn(
        'relative z-20 whitespace-nowrap text-gray-700 transition-colors hover:text-gray-950',
        pathname === href && 'text-gray-950',
      )}
    >
      {children}
    </NextLink>
  );
};

export function LogoType({
  collapsed = false,
  morphOnCollapse = false,
}: {
  collapsed?: boolean;
  morphOnCollapse?: boolean;
}) {
  if (morphOnCollapse) {
    const trailingLetters = ['n', 's', 't', 'a', 'n', 't'];

    return (
      <Link href="/" className="inline-flex items-center">
        <span
          className={cn(
            'relative inline-block h-6 overflow-hidden align-middle transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            collapsed ? 'w-4' : 'w-[6.5rem]',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1/2 left-0 inline-flex -translate-y-1/2 items-center',
            )}
          >
            <span
              className={cn(
                'relative mr-[1px] inline-flex h-[1.12rem] items-center justify-center overflow-hidden align-middle transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                collapsed ? 'w-4' : 'w-[0.58rem]',
              )}
            >
              <span
                className={cn(
                  'absolute inset-0 bg-black transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                  collapsed
                    ? 'scale-100 opacity-100 [transition-delay:70ms]'
                    : 'scale-x-[0.28] scale-y-[0.84] opacity-0 [transition-delay:40ms]',
                )}
              />
              <span
                className={cn(
                  'absolute top-[3px] left-[3px] h-[10px] w-[4px] bg-white transition-[opacity,transform] duration-320 ease-out motion-reduce:transition-none',
                  collapsed
                    ? 'translate-y-0 opacity-100 [transition-delay:170ms]'
                    : 'translate-y-[2px] opacity-0 [transition-delay:0ms]',
                )}
              />
              <span
                className={cn(
                  `${headingClasses} relative z-10 inline-block text-[20px] leading-none font-bold transition-[opacity,transform,filter,color] duration-420 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none`,
                  collapsed
                    ? 'translate-y-[0.22rem] text-white opacity-0 blur-[1px] [transition-delay:40ms]'
                    : 'blur-0 translate-y-0 text-current opacity-100 [transition-delay:0ms]',
                )}
              >
                i
              </span>
            </span>
            <span className="inline-flex">
              {trailingLetters.map((char, index) => (
                <span
                  key={`${char}-${index}`}
                  className={cn(
                    `${headingClasses} inline-block text-[20px] leading-none font-bold transition-[opacity,transform,filter] duration-350 ease-out motion-reduce:transition-none`,
                    collapsed ? 'opacity-0 blur-[2px]' : 'blur-0 opacity-100',
                  )}
                  style={{
                    transform: collapsed
                      ? `translate(${-8 - index * 3}px, 10px)`
                      : 'translate(0px, 0px)',
                    transitionDelay: collapsed
                      ? `${40 + index * 28}ms`
                      : `${(trailingLetters.length - index) * 18}ms`,
                  }}
                >
                  {char}
                </span>
              ))}
            </span>
          </span>
          <span className="sr-only">instant</span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/"
      className={cn(
        'inline-flex items-center',
        collapsed ? 'gap-0.5' : 'gap-2',
      )}
    >
      <LogoIcon />
      <span
        className={cn(
          'inline-flex [transform-origin:left_center] overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out',
          collapsed
            ? 'max-w-0 [transform:perspective(260px)_rotateY(-82deg)] opacity-0'
            : 'max-w-[7.5rem] [transform:perspective(260px)_rotateY(0deg)] opacity-100',
        )}
      >
        <HeadingBrand>instant</HeadingBrand>
      </span>
    </Link>
  );
}

function ProductDropdownDesktop() {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const open = () => {
    if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const close = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      className="relative hidden min-[60rem]:block"
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <button className="flex items-center gap-0.5 whitespace-nowrap hover:text-blue-500">
        Product
        <ChevronDownIcon
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 z-50 pt-3">
          <div className="w-[360px] rounded-lg border bg-white py-2 shadow-lg">
            {products.map((product) => {
              const Icon = productIcons[product.id];
              return (
                <NextLink
                  key={product.id}
                  href={`/product/${product.id}`}
                  onClick={() => setIsOpen(false)}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <div className="text-gray-400 transition-colors group-hover:text-orange-500">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {product.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {product.tagline}
                    </div>
                  </div>
                </NextLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductAccordionMobile() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="self-stretch min-[60rem]:hidden">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex w-full items-center justify-between whitespace-nowrap hover:text-blue-500"
      >
        Product
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-1 pl-2">
              {products.map((product) => (
                <NextLink
                  key={product.id}
                  href={`/product/${product.id}`}
                  className="flex items-center gap-3 rounded-sm py-2"
                >
                  <div className="text-gray-500">
                    {(() => {
                      const Icon = productIcons[product.id];
                      return <Icon className="h-5 w-5" />;
                    })()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{product.name}</div>
                    <div className="max-w-64 text-xs text-gray-500">
                      {product.tagline}
                    </div>
                  </div>
                </NextLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItems() {
  const isHydrated = useIsHydrated();
  const isAuthed = !!useAuthToken();
  if (!isHydrated) return null;
  return (
    <>
      <ProductDropdownDesktop />
      <ProductAccordionMobile />
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
            'whitespace-nowrap text-gray-700 transition-colors hover:text-gray-950',
          )}
          href="/dash"
        >
          Sign up
        </Link>
      )}
    </>
  );
}

export function BareNav({
  children,
  collapseLogo = false,
  morphLogoOnCollapse = false,
}: PropsWithChildren<{
  collapseLogo?: boolean;
  morphLogoOnCollapse?: boolean;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';
  }, [isOpen]);

  return (
    <div className="flex flex-row items-center justify-between gap-4 text-lg md:text-base">
      <LogoType
        collapsed={collapseLogo}
        morphOnCollapse={morphLogoOnCollapse}
      />
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
          'overflow-y-scroll min-[60rem]:overflow-visible',
          // size
          'h-full w-full min-[60rem]:h-12 min-[60rem]:w-auto',
          // layout
          'flex-col items-start gap-6 px-8 py-4 min-[60rem]:flex-row min-[60rem]:items-center min-[60rem]:gap-4 min-[60rem]:p-0',
          // look and feel
          'bg-white/90 min-[60rem]:bg-transparent',
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
        <NavItems />
        {children}
      </div>
    </div>
  );
}

export function MainNav({ transparent = false }: { transparent?: boolean }) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (!transparent) return;

    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 40);
    };

    window.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();

    return () => {
      window.removeEventListener('scroll', updateScrollState);
    };
  }, [transparent]);

  return (
    <div
      className={cn(
        'py-4',
        transparent
          ? cn(
              'fixed top-0 right-0 left-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
              isScrolled
                ? 'border-b-gray-200/80 bg-white/80 backdrop-blur-md'
                : 'border-b-transparent bg-transparent backdrop-blur-none',
            )
          : 'border-b border-b-gray-200',
      )}
    >
      <div className="landing-width mx-auto">
        <BareNav
          collapseLogo={transparent && isScrolled}
          morphLogoOnCollapse={transparent}
        />
      </div>
    </div>
  );
}

export const LandingContainer = ({ children }: PropsWithChildren) => (
  <div className="min-h-full overflow-x-hidden">{children}</div>
);

export function LandingFooter() {
  return (
    <div className="landing-width text-xs text-gray-500">
      <hr className="h-px border-0 bg-gray-200" />
      <div className="flex flex-col gap-2 py-6">
        <div
          className={clsx(`flex flex-col gap-6 md:flex-row md:justify-between`)}
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
