import { MainNav } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing';
import {
  AppBuilders,
  EnterpriseHero,
  GoodAbstractions,
  ChatPlatforms,
  InternalTools,
  Architecture,
  EnterpriseCTA,
} from '@/components/new-landing/enterprise';

export default function () {
  return (
    <div className="text-off-black">
      <MainNav />
      <main className="flex-1">
        <EnterpriseHero />

        <section className="py-16 sm:py-24 sm:pt-12 sm:pb-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <GoodAbstractions />
          </div>
        </section>

        <section className="">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <AppBuilders />
          </div>
        </section>

        <section className="bg-gray-50 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <ChatPlatforms />
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <InternalTools />
          </div>
        </section>

        <section className="bg-gray-50 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Architecture />
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <EnterpriseCTA />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
