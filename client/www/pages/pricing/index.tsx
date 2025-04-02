import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { Button } from '@/components/ui';

// Helpers
// ------------------
const outlineStyle = (isFeatured: boolean) =>
  isFeatured ? 'outline-orange-600/80' : 'outline-gray-600/10';

const opacityStyle = (isDisabled: boolean) =>
  isDisabled ? 'opacity-40' : 'opacity-100';

const plans = [
  {
    name: 'Free',
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
    isFeatured: true,
    description: 'For production apps with the ability to scale',
    price: '$30',
    featuresDescription: 'Everything in the Free plan, plus:',
    features: [
      ['10GB database space', 'then $0.125 per GB'],
      'Priority Support',
      '10 team members per app',
      'Daily backups for last 7 days',
    ],
    cta: 'Get started',
    ctaLink: '/dash?t=billing',
  },
  {
    name: 'Enterprise',
    description: 'For teams building large-scale applications',
    price: 'Custom',
    featuresDescription: 'Everything in the Pro plan, plus:',
    features: [
      'Premium Support',
      'Uptime SLAs',
      'Unlimited team members per app',
      'Daily backups for last 30 days',
    ],
    ctaDisabled: true,
    cta: 'Coming soon!',
    ctaLink:
      'mailto:founders@instantdb.com?subject=InstantDB%20Enterprise%20Plan%20Inquiry',
  },
];

// Components
// ------------------
function Feature({ feature }: { feature: string | string[] }) {
  return (
    <div className="flex flex-row py-2 gap-3 items-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 20 20"
        version="1.1"
        className="w-5 h-5 text-orange-500 flex-none"
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
    isFeatured,
    cta,
    ctaLink,
    ctaDisabled,
  } = plan;
  return (
    <div
      className={`box-border rounded-lg bg-white outline outline-2 -outline-offset-1 ${outlineStyle(
        isFeatured,
      )} flex flex-col justify-between gap-4 p-6 h-full ${opacityStyle(
        ctaDisabled,
      )}`}
    >
      <div>
        <div className="flex items-center justify-between my-2">
          <h5 className="font-mono text-black text-2xl font-medium tracking-tight mr-2">
            {name}
          </h5>
          {isFeatured && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-md font-medium bg-orange-200/20 text-orange-600">
              For teams
            </span>
          )}
        </div>
        <div className="text-black opacity-70">{description}</div>
        <span className="text-black inline-flex gap-1 items-baseline my-4">
          <h3 className="text-black text-3xl sm:text-4xl tracking-tight font-medium leading-none">
            {price}
          </h3>
          {price !== 'Custom' && (
            <span className="text-black leading-none">/month</span>
          )}
        </span>
        <div className="text-black opacity-70 text-sm py-2">
          {featuresDescription}
        </div>
        <div className="flex flex-col">
          {features.map((feature: any, idx: number) => (
            <Feature key={idx} feature={feature} />
          ))}
        </div>
      </div>
      {footer && <div className="text-sm text-gray-500">{footer}</div>}
      <Button
        disabled={ctaDisabled}
        className="py-2 font-medium"
        type="link"
        variant={name === 'Pro' ? 'cta' : 'secondary'}
        href={ctaLink}
      >
        {cta}
      </Button>
    </div>
  );
}

function ThreePlanGrid() {
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-9 max-w-5xl mx-auto w-full">
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
      </Head>
      <div className="flex min-h-screen justify-between flex-col">
        <div>
          {' '}
          <MainNav />
          <ThreePlanGrid />
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
