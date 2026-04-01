import { RouteTabProvider } from '@/components/docs/NavButton';

export function generateStaticParams() {
  return [
    {},
    { tab: ['react'] },
    { tab: ['react-native'] },
    { tab: ['vanilla'] },
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
      paramName="platform"
      value={tab?.[0] || null}
      basePath="/docs/auth/magic-codes"
    >
      {children}
    </RouteTabProvider>
  );
}
