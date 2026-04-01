import { RouteTabProvider } from '@/components/docs/NavButton';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ tab: [] }, { tab: ['web-redirect'] }, { tab: ['rn-web'] }];
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tab?: string[] }>;
}) {
  const { tab } = await params;
  return (
    <RouteTabProvider
      paramName="method"
      value={tab?.[0] || null}
      basePath="/docs/auth/github-oauth"
    >
      {children}
    </RouteTabProvider>
  );
}
