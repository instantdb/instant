import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  ProductNav,
  SectionWide,
} from '@/components/marketingUi';
import { Button } from '@/components/ui';
import { features, layers, hardClosing } from '@/lib/product/sync/examples';

import figmaIcon from '@/public/img/product-pages/sync/figma.svg';
import notionIcon from '@/public/img/product-pages/sync/notion.svg';
import linearIcon from '@/public/img/product-pages/sync/linear.svg';

const syncCompanies = [
  { name: 'Figma', icon: figmaIcon },
  { name: 'Notion', icon: notionIcon },
  { name: 'Linear', icon: linearIcon },
];

function DiagramPre({
  diagram,
  highlights,
}: {
  diagram: string;
  highlights: string[];
}) {
  const escaped = highlights.map((h) =>
    h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = diagram.split(pattern);

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border bg-gray-50 p-5">
      <pre className="font-mono text-xs leading-relaxed text-gray-600">
        {parts.map((part, i) =>
          highlights.includes(part) ? (
            <span key={i} className="text-orange-500">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </pre>
    </div>
  );
}

function HardSection() {
  const [active, setActive] = useState(0);
  const layer = layers[active];
  return (
    <div className="py-6 md:px-14 md:py-14">
      <h3 className="font-mono text-2xl font-bold">
        Building these features is hard
      </h3>
      <p className="mt-4 max-w-2xl text-gray-600">
        Want to add these features to your app on your own? Here's what you'll
        need to build.
      </p>
      <div className="mt-10 flex flex-col gap-6 md:flex-row md:gap-12">
        <div className="md:w-64 md:shrink-0">
          <div className="flex flex-col gap-1">
            {layers.map((l, i) => (
              <button
                key={l.title}
                onClick={() => setActive(i)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                  active === i
                    ? 'bg-orange-50 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`font-mono text-sm font-bold ${active === i ? 'text-orange-600' : 'text-gray-400'}`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-mono text-sm font-bold">{l.title}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 hidden space-y-3 text-sm text-gray-600 md:block">
            {hardClosing.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900">{layer.why}</p>
          <p className="mt-2 text-gray-600">{layer.description}</p>
          <DiagramPre diagram={layer.diagram} highlights={layer.highlights} />
        </div>
      </div>
      <div className="mt-10 max-w-2xl space-y-3 text-gray-600 md:hidden">
        {hardClosing.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </div>
  );
}

export default function SyncEngine() {
  return (
    <LandingContainer>
      <Head>
        <title>Sync Engine - Instant</title>
        <meta
          name="description"
          content="Make every feature feel instant, be collaborative, and work offline. No extra code required."
        />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <div>
          <MainNav />
          <ProductNav currentSlug="sync" />

          {/* Hero */}
          <div className="py-20">
            <SectionWide>
              <div className="flex flex-col gap-10">
                <div className="flex flex-col items-center gap-8 text-center">
                  <p className="font-mono text-sm font-medium tracking-widest text-orange-600 uppercase">
                    Instant Sync
                  </p>
                  <h2 className="font-mono text-2xl leading-normal font-bold tracking-wide md:text-5xl md:leading-tight">
                    <span className="text-orange-600">
                      Delightful applications
                    </span>
                    <br /> by default.
                  </h2>
                  <p className="max-w-lg text-lg text-gray-600">
                    Every feature you build will feel instant, be collaborative,
                    and work offline. <br className="md:hidden" />
                    No extra code required.
                  </p>
                  <div className="flex gap-3">
                    <Button type="link" variant="cta" size="large" href="/dash">
                      Get started
                    </Button>
                    <Button
                      type="link"
                      variant="secondary"
                      size="large"
                      href="/docs"
                    >
                      Read the docs
                    </Button>
                  </div>
                </div>
              </div>
            </SectionWide>
          </div>

          {/* Delightful apps share common features */}
          <div className="my-16">
            <SectionWide>
              <div className="py-6 md:px-14 md:py-14">
                <div className="flex flex-col gap-10 md:flex-row md:gap-20">
                  <div className="md:flex-1">
                    <h3 className="font-mono text-2xl font-bold">
                      Delightful apps share common features
                    </h3>
                    <p className="mt-4 text-gray-600">
                      It's easier than ever to build apps these days, especially
                      when you're using AI. However, making something delightful
                      is still hard. When you look at some of the best apps
                      today, they all have certain features in common.
                    </p>
                    <div className="mt-6 flex items-center gap-5">
                      {syncCompanies.map((company) => (
                        <div
                          key={company.name}
                          className="flex items-center gap-2"
                        >
                          <Image
                            alt={`${company.name} logo`}
                            src={company.icon}
                            width={28}
                            height={28}
                            className="opacity-50"
                          />
                          <span className="text-sm text-gray-400">
                            {company.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-8 md:flex-1">
                    {features.map((f) => (
                      <div key={f.title} className="flex items-start gap-4">
                        <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
                        <div>
                          <p className="font-mono font-bold">{f.title}</p>
                          <p className="mt-2 text-gray-600">{f.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionWide>
          </div>

          {/* Building these features is hard */}
          <div className="my-16">
            <SectionWide>
              <HardSection />
            </SectionWide>
          </div>

          {/* Mini CTA: With Instant you get sync for free */}
          <div className="mt-24 mb-20">
            <SectionWide>
              <div className="text-center">
                <h3 className="font-mono text-2xl font-bold tracking-wide md:text-4xl">
                  With Instant you get <br className="hidden md:block" />
                  <span className="text-orange-600">sync for free.</span>
                </h3>
                <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
                  In the past companies would hire a team of elite engineers to
                  build a custom sync engine. In the future all apps will have
                  sync by default.
                </p>
                <div className="mt-10 flex justify-center gap-3">
                  <Button type="link" variant="cta" href="/dash">
                    Get started
                  </Button>
                  <Button type="link" variant="secondary" href="/docs">
                    Read the docs
                  </Button>
                </div>
              </div>
            </SectionWide>
          </div>
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
