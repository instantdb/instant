import Head from 'next/head';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui';
import { AppMetadata, webMetas, mobileMetas } from '@/lib/examples/data';
import {
  LandingContainer,
  MainNav,
  Section,
  H2,
  H3,
} from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';

function LeftColumn({ app }: { app: AppMetadata }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <H3>{app.title}</H3>
        <p className="mt-1 text-sm text-gray-600">
          {app.linesOfCode} lines of code
        </p>
      </div>

      {/* Tags */}
      <div>
        <div className="flex flex-wrap gap-2">
          {app.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-md bg-gray-200 px-3 py-1 text-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Description -- hidden on mobile */}
      <div className="hidden space-y-2 text-base leading-relaxed text-gray-800 md:block">
        {app.description.split('\n\n').map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function RightColumn({ app }: { app: AppMetadata }) {
  return (
    <div className="space-y-6">
      {/* Screenshot */}
      <img
        src={app.screenshot}
        alt={app.title}
        className="w-full rounded-lg border border-gray-600 object-cover"
      />

      {/* Buttons */}
      <div className="flex gap-4">
        <Button
          type="link"
          href={`/examples/${app.slug}`}
          className="flex-1"
          variant="cta"
        >
          See Example
        </Button>
        <Button
          type="link"
          href={app.githubUrl}
          className="flex-1"
          variant="secondary"
        >
          See Code
        </Button>
      </div>
    </div>
  );
}

const tabs = [
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' },
] as const;

function TabToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <div className="flex justify-center gap-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-lg font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-b-2 border-[#606AF4] text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function Showcase({
  apps,
  activeTab,
  onTabChange,
}: {
  apps: AppMetadata[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <div className="space-y-12">
      <div className="mx-auto mt-12 space-y-8">
        <div className="text-center">
          <H2>Example Apps built w/ Instant</H2>
        </div>
        <p className="mx-auto mb-12 max-w-prose space-y-6 text-lg text-gray-700">
          Curious to see Instant in action? Here are some common apps to give
          you a sense on how to build with Instant.
        </p>
        <TabToggle activeTab={activeTab} onTabChange={onTabChange} />
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2">
        {apps.map((app) => (
          <div
            key={app.slug}
            className="col-span-1 grid grid-cols-1 gap-8 md:col-span-2 md:grid-cols-2"
          >
            <LeftColumn app={app} />
            <RightColumn app={app} />

            {/* Mobile-only Description */}
            <div className="space-y-2 text-base leading-relaxed text-gray-800 md:hidden">
              {app.description.split('\n\n').map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const pageTitle = 'InstantDB Examples';

export default function Page({
  webApps,
  mobileApps,
}: {
  webApps: AppMetadata[];
  mobileApps: AppMetadata[];
}) {
  const router = useRouter();
  const activeTab = router.query.tab === 'mobile' ? 'mobile' : 'web';

  const setTab = (tab: string) => {
    router.push(
      { pathname: '/examples', query: tab === 'web' ? {} : { tab } },
      undefined,
      { shallow: true },
    );
  };

  const apps = activeTab === 'mobile' ? mobileApps : webApps;

  return (
    <LandingContainer>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Learn Instant through example apps" />
      </Head>
      <MainNav />
      <Section>
        <Showcase apps={apps} activeTab={activeTab} onTabChange={setTab} />
      </Section>
      <div className="h-12" />
      <Footer />
    </LandingContainer>
  );
}

export function getStaticProps() {
  return {
    props: {
      webApps: webMetas,
      mobileApps: mobileMetas,
    },
  };
}
