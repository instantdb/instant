import Head from 'next/head';
import { products, productIcons } from '@/lib/productData';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  Section,
  TwoColResponsive,
  H3,
  H4,
  Link,
} from '@/components/marketingUi';
import { Button, Fence, cn } from '@/components/ui';

export function ProductNav({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="hidden border-b border-gray-200 min-[60rem]:block">
      <div className="mx-auto max-w-7xl px-8">
        <div className="no-scrollbar flex gap-1 overflow-x-auto py-1">
          {products.map((product) => {
            const Icon = productIcons[product.id];
            return (
              <Link
                key={product.id}
                href={`/product/${product.id}`}
                className={cn(
                  'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  product.id === currentSlug
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
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
  );
}

export type ProductTab = {
  heading: string;
  description: string;
  code: string;
};

export function ProductPage({
  slug,
  name,
  description,
  headline,
  codeExample,
  sectionHeading,
  tabs,
}: {
  slug: string;
  name: string;
  description: string;
  headline: string;
  codeExample: string;
  sectionHeading: string;
  tabs: ProductTab[];
}) {
  return (
    <LandingContainer>
      <Head>
        <title>{`${name} - Instant`}</title>
        <meta name="description" content={description} />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <div>
          <MainNav />
          <ProductNav currentSlug={slug} />

          {/* Hero */}
          <div className="pt-8 pb-16">
            <Section>
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-6 md:mx-auto md:max-w-2xl md:text-center">
                  <H3>{headline}</H3>
                  <p className="text-gray-800">{description}</p>
                  <div className="flex gap-2 md:justify-center">
                    <Button type="link" variant="cta" href="/dash">
                      Get started
                    </Button>
                    <Button type="link" variant="secondary" href="/docs">
                      Read the docs
                    </Button>
                  </div>
                </div>
                <div className="bg-prism overflow-auto rounded-sm border font-mono text-sm">
                  <Fence
                    darkMode={false}
                    language="javascript"
                    code={codeExample}
                  />
                </div>
              </div>
            </Section>
          </div>

          {/* Sections */}
          <div className="my-16">
            <Section>
              <div className="flex flex-col gap-16">
                <div className="md:mx-auto md:max-w-md md:text-center">
                  <H3>{sectionHeading}</H3>
                </div>
                {tabs.map((tab, i) => (
                  <TwoColResponsive key={i}>
                    <div className="flex flex-1 shrink-0 basis-1/2 flex-col gap-6">
                      <H4>{tab.heading}</H4>
                      <p>{tab.description}</p>
                    </div>
                    <div className="flex flex-1 shrink-0 basis-1/2 flex-col overflow-hidden">
                      <div className="bg-prism overflow-auto rounded-sm border text-sm">
                        <Fence
                          darkMode={false}
                          language="javascript"
                          code={tab.code}
                        />
                      </div>
                    </div>
                  </TwoColResponsive>
                ))}
              </div>
            </Section>
          </div>
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
