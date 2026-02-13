'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from './Button';
import { GitHubIcon } from './icons';

const navLinks = [
  { href: '/tutorial', label: 'Tutorial' },
  { href: '/enterprise', label: 'Enterprise' },
  { href: '/pricing', label: 'Pricing' },
  { href: 'https://instantdb.com/docs', label: 'Docs' },
  { href: '/essays', label: 'Essays' },
  { href: '/about', label: 'About' },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/img/logo_with_text.svg"
              alt="Instant"
              width={120}
              height={32}
              priority
            />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-500 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/instantdb/instant"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-gray-500 transition-colors sm:block"
            >
              <GitHubIcon className="h-5 w-5" />
            </a>

            <Link
              href="https://instantdb.com/dash"
              className="hidden text-sm text-gray-500 transition-colors sm:block"
            >
              Sign In
            </Link>

            <Link href="/dash">
              <Button size="sm" className="hidden sm:inline-flex">
                Get a DB
              </Button>
            </Link>
            <button
              type="button"
              className="p-2 text-gray-500 transition-colors md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="sr-only">Toggle menu</span>
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="bg-white md:hidden">
          <div className="space-y-3 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block text-base text-gray-500 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="space-y-3 pt-4">
              <a
                href="https://github.com/instantdb/instant"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-base text-gray-500 transition-colors"
              >
                <GitHubIcon className="h-5 w-5" />
                GitHub
              </a>
              <Link
                href="https://instantdb.com/dash"
                className="block text-base text-gray-500 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link href="/dash">
                <Button size="md" className="w-full">
                  Get a DB
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
