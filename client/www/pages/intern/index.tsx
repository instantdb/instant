import Head from 'next/head';
import { useState } from 'react';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  Link,
  Section,
  H2,
} from '@/components/marketingUi';
import { Button, FullscreenLoading } from '@/components/ui';
import { useAdmin } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';

type ToolCard = {
  title: string;
  href: string;
  description: string;
  category: string;
};

const tools: ToolCard[] = [
  {
    title: 'Overview',
    href: '/intern/overview',
    description:
      'Our main dashboard on our big screen! Ideally this should show our key metrics and give us a pulse on our most active users!',
    category: 'KPIs',
  },
  {
    title: 'Top Apps',
    href: '/intern/top',
    description:
      'Currently ranks which apps had the most transactions for the week. Set ?n=x at the end of the URL to change the number of days to look back (default 7).',
    category: 'Analytics',
  },
  {
    title: 'Paid Subscriptions',
    href: '/intern/paid',
    description: 'Shows data about our paid apps.',
    category: 'Analytics',
  },
  {
    title: 'User Signup',
    href: '/intern/signup',
    description:
      'When people sign up, we ask them a couple of questions. This is a quick and dirty tool to get a pulse on that data. Might be nicer to revamp this later.',
    category: 'Analytics',
  },
  {
    title: 'Storage Usage',
    href: '/intern/storage',
    description:
      'Quick overview of who is using storage and how much data they are using',
    category: 'Analytics',
  },
  {
    title: 'Investor Updates',
    href: '/intern/investor_updates',
    description:
      'Generates graphs based on our metrics that we use for our investor updates',
    category: 'Comms',
  },
  {
    title: 'User Newsletter',
    href: '/intern/emails',
    description:
      'Little email previewer to make sure our newsletters look good before we send them out',
    category: 'Comms',
  },
  {
    title: 'Docs Feedback',
    href: '/intern/docs-feedback',
    description:
      'We let users leave feedback on our docs. This is a quick way to see what they are saying!',
    category: 'Comms',
  },
];

const categories = ['All', 'KPIs', 'Analytics', 'Comms'];

const ToolCard = ({ title, href, description, category }: ToolCard) => (
  <Link href={href} className="no-underline">
    <div className="relative rounded-md border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md h-full flex flex-col">
      <div className="mb-2 flex items-start justify-between">
        <div className="text-xl font-medium text-gray-900 pr-2">{title}</div>
        <div className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 flex-shrink-0">
          {category}
        </div>
      </div>
      <p className="text-gray-600 flex-1">{description}</p>
      <div className="mt-4">
        <Button variant="primary" type="button" size="mini">
          View
        </Button>
      </div>
    </div>
  </Link>
);

export default function InternIndexPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const isHydrated = useIsHydrated();
  const { isAdmin, isLoading, error } = useAdmin();

  const pageTitle = 'Instant Intern tools';

  if (!isHydrated || isLoading) {
    return (
      <LandingContainer>
        <Head>
          <title>{pageTitle}</title>
        </Head>
        <MainNav />
        <Section>
          <div className="flex justify-center items-center min-h-64">
            <FullscreenLoading />
          </div>
        </Section>
        <LandingFooter />
      </LandingContainer>
    );
  }

  if (error || !isAdmin) {
    return (
      <LandingContainer>
        <Head>
          <title>Access Denied</title>
        </Head>
        <MainNav />
        <Section>
          <div className="mt-12 mb-8 text-center">
            <H2>Access Denied</H2>
            <p className="mt-4 text-gray-600">
              You need to be an Instant admin to access this page.
            </p>
          </div>
        </Section>
        <LandingFooter />
      </LandingContainer>
    );
  }

  const getCategoryButtonClass = (category: string) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      activeCategory === category
        ? 'bg-blue-500 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  const filteredTools = tools.filter((tool) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      tool.title.toLowerCase().includes(searchLower) ||
      tool.description.toLowerCase().includes(searchLower);
    const matchesCategory =
      activeCategory === 'All' || tool.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <LandingContainer>
      <Head>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content="Internal tools and analytics for InstantDB"
        />
      </Head>
      <MainNav />
      <Section>
        <div className="mt-12 mb-8">
          <div className="mb-6 text-center">
            <H2>Internal Tools</H2>
          </div>
          <div className="text-gray-700 space-y-2">
            <p>
              Below are various dashboards and tools we've built to help us
              manage Instant. We've got things like our main metrics overview, a
              generator for investor updates, an email previewer, and more.
            </p>
            <p>
              Got an idea for something useful? Build it on intern and add it
              here!
            </p>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="mb-8 space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search tools..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={getCategoryButtonClass(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Tools Grid */}
        <div className="mb-16">
          {filteredTools.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No tools found matching your search.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 items-stretch">
              {filteredTools.map((tool, index) => (
                <ToolCard key={index} {...tool} />
              ))}
            </div>
          )}
        </div>
      </Section>
      <LandingFooter />
    </LandingContainer>
  );
}
