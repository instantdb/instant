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

        <section className="landing-width mx-auto py-16 sm:py-24 sm:pt-12 sm:pb-24">
          <div className="">
            <GoodAbstractions />
          </div>
        </section>

        <section className="mx-auto max-w-[1206px] px-8">
          <div className="mx-auto max-w-7xl">
            <AppBuilders />
          </div>
        </section>

        <section className="mx-auto max-w-[1206px] px-8 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <ChatPlatforms />
          </div>
        </section>

        <section className="mx-auto max-w-[1206px] px-8 pb-16 sm:pb-24">
          <div className="mx-auto max-w-7xl">
            <InternalTools />
          </div>
        </section>

        <section className="mx-auto max-w-[1206px] px-8 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <Architecture />
          </div>
        </section>

        <section className="mx-auto max-w-[1206px] px-8 pb-16 sm:pb-24">
          <div className="mx-auto max-w-7xl">
            <EnterpriseCTA />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
