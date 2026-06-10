import Link from 'next/link';
import { DiscordIcon, GitHubIcon, XIcon } from './icons';
import { LogoType } from '../marketingUi';

const twitterUrl = 'https://twitter.com/instant_db';
const discordUrl = 'https://discord.com/invite/VU53p7uQcE';
const githubUrl = 'https://github.com/instantdb/instant';

const footerLinks = {
  Product: [
    { href: '/product/database', label: 'Database' },
    { href: '/product/auth', label: 'Auth' },
    { href: '/product/sync', label: 'Sync Engine' },
    { href: '/product/storage', label: 'Storage' },
    { href: '/product/admin-sdk', label: 'Admin SDK' },
  ],
  Resources: [
    { href: '/docs', label: 'Docs' },
    { href: '/tutorial', label: 'Tutorial' },
    { href: '/examples', label: 'Examples' },
    { href: '/essays', label: 'Essays' },
    { href: '/pricing', label: 'Pricing' },
  ],
  Company: [
    { href: '/about', label: 'About' },
    { href: '/hiring', label: 'Careers' },
    { href: 'mailto:hello@instantdb.com', label: 'Contact' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms' },
  ],
  Community: [
    { href: twitterUrl, label: 'Twitter' },
    { href: discordUrl, label: 'Discord' },
    { href: githubUrl, label: 'Github' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="landing-width mx-auto px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 flex items-center justify-between md:col-span-1 md:block">
            <LogoType />
            <div className="mt-3 flex items-center gap-3">
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 transition-colors"
              >
                <XIcon className="h-5 w-5" />
              </a>
              <a
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 transition-colors"
              >
                <DiscordIcon className="h-5 w-5" />
              </a>
              <a
                href={githubUrl}
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
                {links.map((link) => {
                  const isExternal = link.href.startsWith('http');
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-gray-500 transition-colors"
                        {...(isExternal && {
                          target: '_blank',
                          rel: 'noopener noreferrer',
                        })}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
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
