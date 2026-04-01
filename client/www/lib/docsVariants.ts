import docsVariants from '@/data/docsVariants.json';

export type DocsVariantConfig = {
  param: string;
  default: string;
  values: string[];
};

const variantEntries = Object.entries(docsVariants) as [
  string,
  DocsVariantConfig,
][];

function normalizePath(path: string) {
  if (!path) {
    return '/';
  }

  return path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
}

export function getDocsVariantConfig(pagePath: string) {
  return (
    docsVariants[normalizePath(pagePath) as keyof typeof docsVariants] ?? null
  );
}

export function getDocsVariantPath(pagePath: string, value: string) {
  const normalizedPagePath = normalizePath(pagePath);
  const config = getDocsVariantConfig(normalizedPagePath);

  if (!config || value === config.default) {
    return normalizedPagePath;
  }

  return `${normalizedPagePath}/${value}`;
}

export function getCanonicalDocsPagePath(pathname: string) {
  const normalizedPathname = normalizePath(pathname);

  for (const [pagePath, config] of variantEntries) {
    if (normalizedPathname === pagePath) {
      return pagePath;
    }

    for (const value of config.values) {
      if (normalizedPathname === `${pagePath}/${value}`) {
        return pagePath;
      }
    }
  }

  return normalizedPathname;
}

export function isValidDocsVariant(pagePath: string, variant: string) {
  const config = getDocsVariantConfig(pagePath);
  return !!config && config.values.includes(variant);
}

export function getAllDocsVariantRouteParams() {
  return variantEntries.flatMap(([pagePath, config]) => {
    const slug = pagePath.split('/').at(-1);

    if (!slug) {
      return [];
    }

    return config.values
      .filter((value) => value !== config.default)
      .map((variant) => ({ slug, variant }));
  });
}

export function getDocsVariantPagePathFromSlug(slug: string) {
  return (
    variantEntries.find(([pagePath]) => pagePath.endsWith(`/${slug}`))?.[0] ??
    null
  );
}
