import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  Link,
  Section,
  H2,
  H3,
} from '@/components/marketingUi';
import { Button } from '@/components/ui';
import * as og from '@/lib/og';

type JobListing = {
  title: string;
  href: string;
  description: string;
};

const jobListings = [
  {
    title: 'Backend Engineer',
    href: '/hiring/backend-engineer',
    description:
      'Solve hard database problems and build infrastructure to handle 100k+ connections.',
  },
];

const JobCard = ({ title, href, description }: JobListing) => (
  <Link href={href} className="no-underline">
    <div className="relative rounded-md border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div className="mb-2 text-xl font-medium text-gray-900">{title}</div>
      <p className="text-gray-600">{description}</p>
      <div className="mt-4">
        <Button variant="primary" type="button" size="mini">
          View Role
        </Button>
      </div>
    </div>
  </Link>
);

export default function HiringIndexPage() {
  const title = "We're Hiring! | InstantDB";

  return (
    <LandingContainer>
      <Head>
        <title>{title}</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ title, section: 'hiring' })}
        />
      </Head>
      <MainNav />
      <Section>
        <div className="mt-12 mb-8">
          <div className="mb-6 text-center">
            <H2>Build the future of front-end tech.</H2>
          </div>
          <div className="max-w-2xl mx-auto">
            <p className="mb-4 text-gray-700">
              We're a YC S22 company building the infrastructure for
              applications of the future. Our team values high-integrity,
              optimistic, and principle-oriented hackers who love what they do.
            </p>
            <p className="mb-4 text-gray-700">
              We've raised from top investors like Paul Graham, Greg Brockman,
              and James Tamplin (the original CEO of Firebase).
            </p>
            <p className="mb-4 text-gray-700">
              We're looking for talented individuals interested in solving some
              of the hardest problems in real-time databases and front-end
              technology. If you love building delightful developer experiences
              and want to work on cutting-edge tech, we want to hear from you!
            </p>
          </div>
        </div>

        <div className="mb-8">
          <div className="mb-6 text-center">
            <H3>Open Positions</H3>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {jobListings.map((job, index) => (
              <JobCard key={index} {...job} />
            ))}
          </div>
        </div>

        <div className="mt-12 mb-16">
          <div className="mb-6 text-center">
            <H3>Don't see a relevant role?</H3>
          </div>
          <div className="max-w-2xl mx-auto">
            <p className="mb-4 text-gray-700">
              If none of the current roles fit your expertise but you're still
              interested in joining us, we would love to hear from you anyway!
              Please feel free to reach out :)
            </p>
            <div className="mt-8 text-center">
              <Button
                type="link"
                href="mailto:founders@instantdb.com"
                variant="cta"
              >
                Contact Us
              </Button>
            </div>
          </div>
        </div>
      </Section>
      <LandingFooter />
    </LandingContainer>
  );
}
