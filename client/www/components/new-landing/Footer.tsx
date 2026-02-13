import Link from 'next/link';
import { GitHubIcon, XIcon } from './icons';
import { LogoType } from '../marketingUi';

const footerLinks = {
  Product: [
    { href: '/pricing', label: 'Pricing' },
    { href: '/docs', label: 'Docs' },
    { href: '/tutorial', label: 'Tutorial' },
  ],
  Resources: [
    { href: 'https://discord.com/invite/VU53p7uQcE', label: 'Discord' },
    { href: 'https://status.instantdb.com', label: 'Status' },
  ],
  Company: [
    { href: '/about', label: 'About' },
    { href: '/hiring', label: 'Careers' },
    { href: 'founders:hello@instantdb.com', label: 'Contact' },
  ],
  Legal: [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="landing-width mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <LogoType />
            <div className="mt-4 flex items-center gap-4">
              <a
                href="https://twitter.com/instant_db"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 transition-colors"
              >
                <XIcon className="h-5 w-5" />
              </a>
              <a
                href="https://github.com/instantdb/instant"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 transition-colors"
              >
                <GitHubIcon className="h-5 w-5" />
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold">{category}</h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-500 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Instant. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
