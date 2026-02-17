import { MainNav } from '@/components/marketingUi';
import { AppBuilders } from '@/components/new-landing/enterprise/AppBuilders';
import { Architecture } from '@/components/new-landing/enterprise/Architecture';
import { ChatPlatforms } from '@/components/new-landing/enterprise/ChatPlatforms';
import { EnterpriseCTA } from '@/components/new-landing/enterprise/EnterpriseCTA';
import { EnterpriseHero } from '@/components/new-landing/enterprise/EnterpriseHero';
import { GoodAbstractions } from '@/components/new-landing/enterprise/GoodAbstractions';
import { InternalTools } from '@/components/new-landing/enterprise/InternalTools';
import { Footer } from '@/components/new-landing/Footer';

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
