import type { Metadata } from 'next';
import { getFiles } from 'recipes';
import Content from './content';
import { MainNav } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';
import { Section } from '@/components/new-landing/Section';
import { SectionTitle } from '@/components/new-landing/typography';

export const metadata: Metadata = {
  title: 'Instant Recipes',
};

export default function Page() {
  const files = getFiles();
  return (
    <div className="text-off-black w-full overflow-x-auto">
      <MainNav />

      <div className="relative overflow-hidden pt-16">
        <TopWash />
        <Section className="relative pt-12 pb-6 sm:pt-16 sm:pb-10">
          <div className="flex flex-col items-center text-center">
            <SectionTitle>Recipes</SectionTitle>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-balance sm:text-xl">
              With the right abstractions, you and your agents can make a lot of
              progress with a lot less code. Take a look at some of what's
              possible below.
            </p>
          </div>
        </Section>
      </div>

      <Content files={files} />

      <Footer />
    </div>
  );
}
