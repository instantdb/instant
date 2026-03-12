import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
import { Button } from '@/components/ui';
import * as og from '@/lib/og';
import { Footer } from '@/components/new-landing/Footer';
import { SectionTitle, SectionSubtitle } from '@/components/new-landing/typography';

// Helpers
// ------------------
const getVariantStyles = (variant: string) => {
  switch (variant) {
    case 'startup':
      return {
        outline: 'outline-orange-600/80',
        outlineWidth: 'outline-2',
        background: 'bg-white',
        iconColor: 'text-orange-500',
      };
    default:
      return {
        outline: 'outline-gray-600/10',
        outlineWidth: 'outline-2',
        background: 'bg-white',
        iconColor: 'text-gray-500',
      };
  }
};

const opacityStyle = (isDisabled: boolean) =>
  isDisabled ? 'opacity-40' : 'opacity-100';

const plans = [
  {
    name: 'Free',
    variant: 'default',
    description: 'Generous limits to get your app off the ground',
    price: '$0',
    featuresDescription: 'Includes:',
    features: [
      'Unlimited API requests',
      '1GB database space',
      'Community Support',
      '1 team member per app',
    ],
    footer:
      'No credit card required, free projects are never paused, available for commercial use.',
    cta: 'Get started',
    ctaLink: '/dash',
  },
  {
    name: 'Pro',
    variant: 'default',
    description: 'For production apps with the ability to scale',
    price: '$30',
    featuresDescription: 'Everything in the Free plan, plus:',
    features: [
      ['10GB database space', 'then $0.125 per GB'],
      'Priority Support',
      '10 team members per app',
      'Daily backups for last 7 days',
    ],
    footer: 'Storage counts towards database space.',
    cta: 'Get started',
    ctaLink: '/dash?t=billing',
  },
  {
    name: 'Startup',
    variant: 'startup',
    description: 'For teams with multiple environments and apps',
    price: '$600',
    featuresDescription: 'Everything in the Pro plan, plus:',
    features: [
      ['250GB database space', 'then $0.125 per GB'],
      'Slack support',
      'Unlimited team members per app',
      'Unlimited pro apps',
    ],
    footer: 'Perfect for growing teams building multiple apps.',
    cta: 'Get started',
    ctaLink: '/dash?t=billing',
  },
  {
    name: 'Enterprise',
    variant: 'default',
    description: 'For teams building large-scale applications',
    featuresDescription: 'Everything in the Startup plan, plus:',
    price: 'Custom',
    features: [
      'Premium Support',
      'Uptime SLAs',
      'Daily backups for last 30 days',
    ],
    ctaDisabled: false,
    cta: 'Contact us',
    ctaLink:
      'mailto:founders@instantdb.com?subject=InstantDB%20Enterprise%20Plan%20Inquiry',
  },
];

// Components
// ------------------
function Feature({
  feature,
  variant,
}: {
  feature: string | string[];
  variant: string;
}) {
  const styles = getVariantStyles(variant);

  return (
    <div className="flex flex-row items-center gap-3 py-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 20 20"
        version="1.1"
        className={`h-5 w-5 ${styles.iconColor} flex-none`}
      >
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M16.705 4.153a.75.75 0 0 1 .142 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893l7.48-9.817a.75.75 0 0 1 1.05-.143Z"
          clipRule="evenodd"
        />
      </svg>
      {typeof feature === 'object' ? (
        <div className="flex flex-col gap-1">
          <span>{feature[0]}</span>
          <span className="text-sm text-gray-500">{feature[1]}</span>
        </div>
      ) : (
        <span>{feature}</span>
      )}
    </div>
  );
}

function Plan({ plan }: { plan: any }) {
  const {
    name,
    description,
    price,
    featuresDescription,
    features,
    footer,
    variant,
    cta,
    ctaLink,
    ctaDisabled,
  } = plan;

  const styles = getVariantStyles(variant);

  return (
    <div
      className={`box-border rounded-lg ${styles.background} outline-solid ${styles.outlineWidth} -outline-offset-1 ${styles.outline} flex h-full flex-col justify-between gap-6 p-6 ${opacityStyle(ctaDisabled)}`}
    >
      <div>
        <div className="my-2 flex items-center justify-between">
          <h5 className="mr-2 text-2xl font-normal tracking-tight">
            {name}
          </h5>
        </div>
        <div className="opacity-60">{description}</div>
        {price && (
          <span className="my-4 inline-flex items-baseline gap-1">
            <h3 className="text-3xl leading-none font-normal tracking-tight sm:text-4xl">
              {price}
            </h3>
            {price !== 'Custom' && (
              <span className="leading-none opacity-60">/month</span>
            )}
          </span>
        )}
        <div className="py-2 text-sm opacity-60">
          {featuresDescription}
        </div>
        <div className="flex flex-col">
          {features.map((feature: any, idx: number) => (
            <Feature key={idx} feature={feature} variant={variant} />
          ))}
        </div>
      </div>
      {footer && <div className="text-sm text-gray-500">{footer}</div>}
      <Button
        disabled={ctaDisabled}
        className="py-2 font-medium"
        type="link"
        variant={variant === 'startup' ? 'cta' : 'secondary'}
        href={ctaLink}
      >
        {cta}
      </Button>
    </div>
  );
}

function FourPlanGrid() {
  return (
    <div className="pt-32 pb-16 sm:pt-40 sm:pb-24">
      <div className="landing-width mx-auto flex flex-col gap-16">
        <div className="text-center">
          <SectionTitle>
            Never paused.
            <br />
            Unlimited free projects.
            <br />
            Simple pricing.
          </SectionTitle>

          <SectionSubtitle>
            Whether you're building a side project or your next big thing, you
            can get started with Instant for free. We don't pause projects, we
            don't limit active applications, and we have no restrictions for
            commercial use.
          </SectionSubtitle>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <Plan key={plan.name} plan={plan} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Page
// ------------------
export default function Page() {
  return (
    <div className="text-off-black relative min-h-screen">
      <Head>
        <title>Instant Pricing</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ section: 'pricing' })}
        />
      </Head>
      <MainNav transparent />
      <main className="flex-1">
        <FourPlanGrid />
      </main>
      <Footer />
    </div>
  );
}
