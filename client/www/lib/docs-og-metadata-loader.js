// Post-processes markdoc loader output for docs pages to auto-inject og:image.
// The markdoc loader generates: export const metadata = frontmatter.nextjs?.metadata;
// We replace it so the og:image is derived from the file path automatically.
module.exports = function docsOgMetadataLoader(source) {
  // Extract filepath from the generated code
  const filepathMatch = source.match(/const filepath = "([^"]+)"/);
  if (!filepathMatch) return source;

  // e.g. /docs/instaql/page.md -> instaql
  // /docs/auth/google-oauth/[[...tab]]/page.md -> auth/google-oauth
  const filepath = filepathMatch[1];
  const slug =
    filepath
      .replace(/^\/docs\//, '')
      .replace(/\/?\[{1,2}\.{3}\w+\]{1,2}/, '')
      .replace(/(^|\/)page\.md$/, '') || 'index';

  return source.replace(
    'export const metadata = frontmatter.nextjs?.metadata;',
    `export const metadata = {
  ...frontmatter.nextjs?.metadata,
  openGraph: {
    ...frontmatter.nextjs?.metadata?.openGraph,
    images: ["/api/docs-og?slug=${slug}"],
  },
};`,
  );
};
