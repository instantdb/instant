import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { Button } from '@/components/ui';
import * as og from '@/lib/og';

// Helpers
// ------------------
const getVariantStyles = (variant: string) => {
  switch (variant) {
    case 'teams':
      return {
        outline: 'outline-orange-600/80',
        outlineWidth: 'outline-2',
        background: 'bg-white',
        textColor: 'text-black',
        iconColor: 'text-orange-500',
        badge: {
          text: 'For teams',
          bgColor: 'bg-orange-200/20',
          textColor: 'text-orange-600',
        },
      };
    case 'platform':
      return {
        outline: 'outline-blue-600/60',
        outlineWidth: 'outline-3',
        background: 'bg-white',
        textColor: 'text-black',
        iconColor: 'text-blue-500',
        badge: {
          text: 'Agents',
          bgColor: 'bg-blue-200/30',
          textColor: 'text-blue-700',
        },
      };
    default:
      return {
        outline: 'outline-gray-600/10',
        outlineWidth: 'outline-2',
        background: 'bg-white',
        textColor: 'text-black',
        iconColor: 'text-orange-500',
        badge: null,
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
    variant: 'teams',
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
    name: 'Enterprise',
    variant: 'default',
    description: 'For teams building large-scale applications',
    featuresDescription: 'Everything in the Pro plan, plus:',
    price: 'Custom',
    features: [
      'Premium Support',
      'Uptime SLAs',
      'Unlimited team members per app',
      'Daily backups for last 30 days',
    ],
    ctaDisabled: false,
    cta: 'Contact us',
    ctaLink:
      'mailto:founders@instantdb.com?subject=InstantDB%20Enterprise%20Plan%20Inquiry',
  },
  {
    name: 'Platform',
    variant: 'platform',
    description: 'For teams making app builders and agents.',
    price: 'Custom',
    featuresDescription: 'Includes:',
    features: [
      'On-demand database creation in <100ms',
      'White-glove onboarding',
      'Dedicated support',
    ],
    cta: 'Contact us',
    ctaLink:
      'mailto:founders@instantdb.com?subject=InstantDB%20Platform%20Plan%20Inquiry',
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
    <div className="flex flex-row py-2 gap-3 items-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 20 20"
        version="1.1"
        className={`w-5 h-5 ${styles.iconColor} flex-none`}
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
          <span className="text-black">{feature[0]}</span>
          <span className="text-gray-500 text-sm">{feature[1]}</span>
        </div>
      ) : (
        <span className="text-black">{feature}</span>
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
      className={`box-border rounded-lg ${styles.background} outline ${styles.outlineWidth} -outline-offset-1 ${styles.outline} flex flex-col justify-between gap-4 p-6 h-full ${opacityStyle(ctaDisabled)}`}
    >
      <div>
        <div className="flex items-center justify-between my-2">
          <h5
            className={`font-mono text-2xl font-medium tracking-tight mr-2 ${styles.textColor}`}
          >
            {name}
          </h5>
          {styles.badge && (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-md font-medium ${styles.badge.bgColor} ${styles.badge.textColor}`}
            >
              {styles.badge.text}
            </span>
          )}
        </div>
        <div className={`opacity-70 ${styles.textColor}`}>{description}</div>
        {price && (
          <span
            className={`inline-flex gap-1 items-baseline my-4 ${styles.textColor}`}
          >
            <h3
              className={`text-3xl sm:text-4xl tracking-tight font-medium leading-none ${styles.textColor}`}
            >
              {price}
            </h3>
            {price !== 'Custom' && (
              <span className={`leading-none ${styles.textColor}`}>/month</span>
            )}
          </span>
        )}
        <div className={`opacity-70 text-sm py-2 ${styles.textColor}`}>
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
        variant={
          variant === 'teams'
            ? 'cta'
            : variant === 'platform'
              ? 'primary'
              : 'secondary'
        }
        href={ctaLink}
      >
        {cta}
      </Button>
    </div>
  );
}

function FourPlanGrid() {
  return (
    <div>
      <div className="flex flex-col flex-1 px-4 py-8 gap-12">
        <div className="flex flex-col flex-1 max-w-3xl mx-auto">
          <h1 className="font-mono text-black text-3xl leading-10 font-medium tracking-tighter text-center">
            Never paused.
            <br />
            Unlimited free projects.
            <br />
            Simple pricing.
          </h1>
        </div>

        <div className="flex flex-col flex-1 max-w-3xl mx-auto">
          <div className="text-black text-lg space-y-4">
            <p>
              Whether you're building a side project or your next big thing, you
              can get started with Instant <strong>for free</strong>.
            </p>
            <p>
              We don't pause projects, we don't limit number of active
              applications, and we have no restrictions for commercial use. When
              you're ready to grow, we have plans that scale with you.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
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
    <LandingContainer>
      <Head>
        <title>Instant Pricing</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ section: 'pricing' })}
        />
      </Head>
      <div className="flex min-h-screen justify-between flex-col">
        <div>
          {' '}
          <MainNav />
          <FourPlanGrid />
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
