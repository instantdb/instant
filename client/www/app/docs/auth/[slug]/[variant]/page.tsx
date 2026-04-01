import { DocsVariantProvider } from '@/components/docs/DocsVariantContext';
import {
  getAllDocsVariantRouteParams,
  getDocsVariantConfig,
  getDocsVariantPagePathFromSlug,
  isValidDocsVariant,
} from '@/lib/docsVariants';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

const docModules = {
  apple: () => import('../../apple/page.md'),
  'github-oauth': () => import('../../github-oauth/page.md'),
  'google-oauth': () => import('../../google-oauth/page.md'),
  'linkedin-oauth': () => import('../../linkedin-oauth/page.md'),
  'magic-codes': () => import('../../magic-codes/page.md'),
} as const;

type VariantRouteParams = Promise<{
  slug: keyof typeof docModules;
  variant: string;
}>;

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllDocsVariantRouteParams();
}

export async function generateMetadata({
  params,
}: {
  params: VariantRouteParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const loadModule = docModules[slug];

  if (!loadModule) {
    notFound();
  }

  const module = await loadModule();
  return module.metadata ?? {};
}

export default async function AuthDocsVariantPage({
  params,
}: {
  params: VariantRouteParams;
}) {
  const { slug, variant } = await params;
  const loadModule = docModules[slug];
  const pagePath = getDocsVariantPagePathFromSlug(slug);

  if (!loadModule || !pagePath || !isValidDocsVariant(pagePath, variant)) {
    notFound();
  }

  const config = getDocsVariantConfig(pagePath);

  if (!config) {
    notFound();
  }

  const DocPage = (await loadModule()).default;

  return (
    <DocsVariantProvider
      value={{
        pagePath,
        param: config.param,
        value: variant,
      }}
    >
      <DocPage />
    </DocsVariantProvider>
  );
}
