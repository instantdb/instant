import { RouteTabProvider } from '@/components/docs/NavButton';

export function generateStaticParams() {
  return [
    {},
    { tab: ['web-popup'] },
    { tab: ['web-redirect'] },
    { tab: ['native'] },
  ];
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
      basePath="/docs/auth/apple"
    >
      {children}
    </RouteTabProvider>
  );
}
