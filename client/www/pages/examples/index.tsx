import Head from 'next/head';
import { Button } from '@/components/ui';
import { AppMetadata, appMetas } from '@/lib/examples/data';
import {
  LandingFooter,
  LandingContainer,
  MainNav,
  Section,
  H2,
  H3,
} from '@/components/marketingUi';

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

function Showcase({ apps }: { apps: AppMetadata[] }) {
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

export default function Page({ apps }: { apps: AppMetadata[] }) {
  return (
    <LandingContainer>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Learn Instant through example apps" />
      </Head>
      <MainNav />
      <Section>
        <Showcase apps={apps} />
      </Section>
      <div className="h-12" />
      <LandingFooter />
    </LandingContainer>
  );
}

export function getStaticProps() {
  return {
    props: { apps: appMetas },
  };
}
