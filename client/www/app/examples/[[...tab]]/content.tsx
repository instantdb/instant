import { AppMetadata } from '@/lib/examples/data';
import { MainNav } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';
import { Section } from '@/components/new-landing/Section';
import { TopWash } from '@/components/new-landing/TopWash';
import { AnimateIn } from '@/components/new-landing/AnimateIn';
import {
  SectionTitle,
  SectionSubtitle,
  SmallButton,
} from '@/components/new-landing/typography';
import Link from 'next/link';
import { BrowserChrome } from '@/components/BrowserChrome';

function LeftColumn({ app }: { app: AppMetadata }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-3xl leading-snug font-normal sm:text-4xl">
          {app.title}
        </h3>
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
    <div className="self-start overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <BrowserChrome />
      {/* Screenshot */}
      <div className="max-h-[340px] overflow-hidden">
        <img src={app.screenshot} alt={app.title} className="w-full" />
      </div>
      {/* Buttons */}
      <div
        className="flex justify-end gap-3 border-t border-gray-200/60 px-3 py-2"
        style={{ backgroundColor: '#f7f7f7' }}
      >
        <SmallButton href={`/examples/${app.slug}`} variant="cta">
          See Example
        </SmallButton>
        <SmallButton href={app.githubUrl} variant="secondary">
          See Code
        </SmallButton>
      </div>
    </div>
  );
}

const tabs = [
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' },
] as const;

function TabToggle({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex justify-center gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.id === 'web' ? '/examples' : `/examples/${tab.id}`}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-orange-600 bg-orange-600 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function Showcase({
  apps,
  activeTab,
}: {
  apps: AppMetadata[];
  activeTab: string;
}) {
  return (
    <div className="space-y-12">
      <div className="space-y-8">
        <div className="text-center">
          <SectionTitle>Example Apps built w/ Instant</SectionTitle>
          <SectionSubtitle>
            Curious to see Instant in action? Here are some common apps to give
            you a sense on how to build with Instant.
          </SectionSubtitle>
        </div>
        <TabToggle activeTab={activeTab} />
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2">
        {apps.map((app, i) => (
          <AnimateIn
            key={app.slug}
            delay={i * 100}
            className="col-span-1 grid grid-cols-1 gap-8 md:col-span-2 md:grid-cols-[1fr_minmax(400px,1fr)]"
          >
            <LeftColumn app={app} />
            <RightColumn app={app} />

            {/* Mobile-only Description */}
            <div className="space-y-2 text-base leading-relaxed text-gray-800 md:hidden">
              {app.description.split('\n\n').map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </AnimateIn>
        ))}
      </div>
    </div>
  );
}

export default function ExamplesContent({
  webApps,
  mobileApps,
  activeTab,
}: {
  webApps: AppMetadata[];
  mobileApps: AppMetadata[];
  activeTab: string;
}) {
  const apps = activeTab === 'mobile' ? mobileApps : webApps;

  return (
    <div className="text-off-black w-full overflow-x-auto">
      <MainNav />

      <div className="relative overflow-hidden pt-16">
        <TopWash />
        <Section className="relative">
          <Showcase apps={apps} activeTab={activeTab} />
        </Section>
      </div>

      <Footer />
    </div>
  );
}
