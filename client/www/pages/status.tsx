import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { Button } from '@/components/ui';
import * as og from '@/lib/og';
import { useState, useEffect } from 'react';
import { isInteger, random } from 'lodash';
import { map } from '@/data/docsNavigation';

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

function checkIF(anum: number) {
  if (anum < 0 || anum > 100) {
    throw new Error('Error: the percentage must be between 0 and 100');
  }
  if (anum >= 100) {
    return '#22c55e';
  } else if (anum >= 99.9) {
    return '#86efac';
  } else if (anum >= 99) {
    return '#fbbf24';
  } else {
    return '#fb923c';
  }
}

function StatusPage() {
  const [small, setSmall] = useState(false);
  const [uptimeData, setUptimeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [nextUpdate, setNextUpdate] = useState(60);

  const fetchUptimeData = async () => {
    try {
      const response = await fetch('/api/uptime');
      const data = await response.json();
      setUptimeData(data);
      setLastUpdated(new Date());
      setNextUpdate(60);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch uptime data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNextUpdate((prev) => {
        if (prev <= 1) {
          fetchUptimeData();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchUptimeData();
  }, []);

  useEffect(() => {
    const animate = () => {
      setSmall(false);
      setTimeout(() => {
        setSmall(true);
        setTimeout(() => {
          animate();
        }, 3000);
      }, 100);
    };
    animate();

    return () => {};
  }, []);

  const backendMonitor = uptimeData?.monitors?.find((m: any) => 
    m.friendly_name?.toLowerCase().includes('backend') || 
    m.friendly_name?.toLowerCase().includes('api')
  );
  const walMonitor = uptimeData?.monitors?.find((m: any) => 
    m.friendly_name?.toLowerCase().includes('wal') || 
    m.friendly_name?.toLowerCase().includes('write')
  );

  const allOperational = uptimeData?.monitors?.every((m: any) => m.status === 2);
  return (
    <div className="flex flex-col relative min-h-screen overflow-y-auto">
      <div className="flex justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 z-10 py-4 md:py-8 relative">
        <div className="relative bg-white w-full max-w-4xl h-32 sm:h-44 md:h-60 border-2 border-gray-200">
          <div className="absolute top-3 right-4 text-xs md:text-sm font-mono">
            <div className="text-right">
              <div className="font-semibold text-gray-700 mb-1">
                Service Status
              </div>
              <text className="text-gray-500">
                Last updated {lastUpdated.toLocaleTimeString()} | Next update in {nextUpdate} sec.
              </text>
            </div>
          </div>
          <div className="flex gap-4 sm:gap-6 md:gap-8 h-full justify-center items-center px-4">
            <view className={`flex justify-center items-center ${allOperational ? 'bg-green-400' : 'bg-orange-400'} h-10 w-10 sm:h-12 sm:w-12 rounded-full shadow-2xl flex-shrink-0`}>
              <view
                className={`${allOperational ? 'bg-green-400' : 'bg-orange-400'} h-8 w-8 sm:h-10 sm:w-10 absolute rounded-full shadow-2xl`}
                style={{
                  transform: small ? 'scale(3)' : 'scale(1)',
                  opacity: small ? 0 : 1,
                  transition: small
                    ? 'transform 2s ease, opacity 2s ease'
                    : 'none',
                }}
              ></view>
            </view>

            <text className="font-mono text-lg sm:text-xl md:text-2xl">
              {loading ? 'Loading...' : (allOperational ? 'All systems Operational' : 'Some systems experiencing issues')}
            </text>
          </div>
        </div>
      </div>

      <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
        <div className="font-mono flex-1 max-w-4xl">
          <text className="text-sm md:text-base font-semibold">
            Uptime last 90 days
          </text>
          <div className="shadow-sm bg-white border-gray-200 border-2 p-3 md:p-4 mt-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
              <div className="flex items-center gap-2">
                <text className="text-sm md:text-base font-medium">
                  Instant backend
                </text>
                <text className="text-xs md:text-sm text-gray-500">|</text>
                <text className="text-sm md:text-base text-green-500 font-semibold">
                  {backendMonitor?.uptime_ratio?.['90d']?.toFixed(3) || '99.920'}%
                </text>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <view className={`relative ${backendMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full flex justify-center items-center`}>
                  <view
                    className={`absolute ${backendMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full`}
                    style={{
                      transform: small ? 'scale(3)' : 'scale(1)',
                      opacity: small ? 0 : 0.5,
                      transition: small
                        ? 'transform 2s ease, opacity 1.8s ease'
                        : 'none',
                    }}
                  ></view>
                </view>
                <text className="text-xs md:text-sm text-gray-600">
                  {backendMonitor?.status === 2 ? 'Operational' : 'Issues Detected'}
                </text>
              </div>
            </div>
            <div className="flex h-10 gap-px">
              {(backendMonitor?.daily_uptime || Array(90).fill(100)).map((percentage: number, index: number) => {
                const date = new Date();
                date.setDate(date.getDate() - (89 - index));
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                
                return (
                  <view
                    key={index}
                    className="flex-1 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: checkIF(percentage) }}
                    title={`${dateStr}: ${percentage.toFixed(3)}% uptime`}
                  ></view>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <text className="text-xs text-gray-500">90 days ago</text>
              <text className="text-xs text-gray-500">Today</text>
            </div>
            <div className="flex py-6">
              <view className="bg-slate-200 h-0.5 w-full"></view>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
              <div className="flex items-center gap-2">
                <text className="text-sm md:text-base font-medium">
                  Instant WAL
                </text>
                <text className="text-xs md:text-sm text-gray-500">|</text>
                <text className="text-sm md:text-base text-green-500 font-semibold">
                  {walMonitor?.uptime_ratio?.['90d']?.toFixed(3) || '99.928'}%
                </text>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <view className={`relative ${walMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full flex justify-center items-center`}>
                  <view
                    className={`absolute ${walMonitor?.status === 2 ? 'bg-green-400' : 'bg-orange-400'} w-2 h-2 rounded-full`}
                    style={{
                      transform: small ? 'scale(3)' : 'scale(1)',
                      opacity: small ? 0 : 0.5,
                      transition: small
                        ? 'transform 2s ease, opacity 1.8s ease'
                        : 'none',
                    }}
                  ></view>
                </view>
                <text className="text-xs md:text-sm text-gray-600">
                  {walMonitor?.status === 2 ? 'Operational' : 'Issues Detected'}
                </text>
              </div>
            </div>
            <div className="flex h-10 gap-px">
              {(walMonitor?.daily_uptime || Array(90).fill(100)).map((percentage: number, index: number) => {
                const date = new Date();
                date.setDate(date.getDate() - (89 - index));
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                
                return (
                  <view
                    key={index}
                    className="flex-1 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: checkIF(percentage) }}
                    title={`${dateStr}: ${percentage.toFixed(3)}% uptime`}
                  ></view>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <text className="text-xs text-gray-500">90 days ago</text>
              <text className="text-xs text-gray-500">Today</text>
            </div>
          </div>
        </div>
      </div>

      <div className="flex z-10 justify-center px-4 sm:px-8 md:px-16 lg:px-32 xl:px-64 py-4 relative">
        <div className="font-mono flex-1 max-w-4xl">
          <text className="text-sm md:text-base font-semibold">
            Overall Uptime
          </text>
          <div className="flex shadow-sm bg-white border-gray-200 border-2 p-3 md:p-4 mt-2 h-48 md:h-64 justify-center items-center">
            <div className="flex items-center flex-row gap-10">
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">{uptimeData?.overall_uptime?.['24h']?.toFixed(3) || '100.000'}%</text>
                <text className="text-sm text-gray-500">Last 24 Hours</text>
              </div>
              <view className="w-0.5 h-20 bg-gray-200"></view>
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">{uptimeData?.overall_uptime?.['7d']?.toFixed(3) || '99.910'}%</text>
                <text className="text-sm text-gray-500">Last 7 Days</text>
              </div>
              <view className="w-0.5 h-20 bg-gray-200"></view>
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">{uptimeData?.overall_uptime?.['30d']?.toFixed(3) || '99.837'}%</text>
                <text className="text-sm text-gray-500">Last 30 Days</text>
              </div>
              <view className="w-0.5 h-20 bg-gray-200"></view>
              <div className="flex flex-col w-32 text-center">
                <text className="text-2xl font-semibold">{uptimeData?.overall_uptime?.['90d']?.toFixed(3) || '99.621'}%</text>
                <text className="text-sm text-gray-500">Last 90 Days</text>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <LandingContainer>
      <Head>
        <title>Instant Status</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ section: 'pricing' })}
        />
      </Head>
      <div className="flex min-h-screen justify-between flex-col">
        <div>
          <MainNav />
        </div>
        <StatusPage />
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
