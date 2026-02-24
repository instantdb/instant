import { useAuthToken } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/solid';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import NextLink from 'next/link';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, cn, LogoIcon } from '@/components/ui';
import { products, productIcons } from '@/lib/productData';

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
}) => (
  <NextLink href={href} className="whitespace-nowrap hover:text-blue-500">
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

function ProductDropdownDesktop() {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const open = () => {
    clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const close = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
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
          <div className="w-[480px] rounded-sm border bg-white p-4 shadow-lg">
            <div className="grid grid-cols-2 gap-1">
              {products.map((product) => (
                <NextLink
                  key={product.id}
                  href={`/product/${product.id}`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-start gap-3 rounded-sm p-3 transition-colors hover:bg-gray-50"
                >
                  <div className="mt-0.5 text-gray-500">
                    {(() => {
                      const Icon = productIcons[product.id];
                      return <Icon className="h-5 w-5" />;
                    })()}
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
              ))}
            </div>
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
                    <div className="text-xs text-gray-500">
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
      <NavLink href="/pricing">Pricing</NavLink>
      <NavLink href="/tutorial">Tutorial</NavLink>
      <NavLink href="/examples">Examples</NavLink>
      <NavLink href="/recipes">Recipes</NavLink>
      <NavLink href="/essays">Essays</NavLink>
      <NavLink href="/docs">Docs</NavLink>
      <NavLink href="/hiring">Hiring</NavLink>
      <NavLink href="https://discord.com/invite/VU53p7uQcE">
        <span className="hidden min-[60rem]:inline">
          <img src="/marketing/discord-icon.svg" className="h-5 w-5" />
        </span>
        <span className="min-[60rem]:hidden">Discord</span>
      </NavLink>
      <NavLink href="https://github.com/instantdb/instant">
        <span className="hidden min-[60rem]:inline">
          <img
            src="https://img.shields.io/github/stars/instantdb/instant?style=flat-square&logo=github&label=GitHub&labelColor=000000&color=F54900"
            alt="GitHub stars"
            className="h-5"
          />
        </span>
        <span className="min-[60rem]:hidden">GitHub</span>
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
    <div className="flex flex-row items-center justify-between gap-4 text-lg md:text-base">
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
          'overflow-y-scroll min-[60rem]:overflow-visible',
          // size
          'h-full w-full min-[60rem]:h-12 min-[60rem]:w-auto',
          // layout
          'flex-col items-start gap-6 px-8 py-4 min-[60rem]:flex-row min-[60rem]:items-center min-[60rem]:gap-4 min-[60rem]:p-0',
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
        <NavItems />
      </div>
    </div>
  );
}

export function MainNav({ children }: PropsWithChildren) {
  return (
    <div className="py-4">
      <div className="mx-auto max-w-7xl px-8">
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
            <div className="flex flex-col gap-2 font-mono md:gap-0">
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
