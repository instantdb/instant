import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/posts';
import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';

export const metadata: Metadata = {
  title: 'OG Image Preview',
  robots: 'noindex',
};

const staticPages = [
  '/',
  '/about',
  '/essays',
  '/examples',
  '/hiring',
  '/hiring/backend-engineer',
  '/pricing',
  '/product/admin-sdk',
  '/product/auth',
  '/product/database',
  '/product/storage',
  '/product/sync',
  '/recipes',
  '/tutorial',
];

function getDocPages(): string[] {
  const docsDir = path.join(process.cwd(), 'app', 'docs');
  const pages: string[] = [];

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const sub = path.join(dir, entry.name);
        if (fs.existsSync(path.join(sub, 'page.md'))) {
          pages.push(`${prefix}/${entry.name}`);
        }
        walk(sub, `${prefix}/${entry.name}`);
      }
    }
  }

  if (fs.existsSync(path.join(docsDir, 'page.md'))) {
    pages.push('/docs');
  }
  walk(docsDir, '/docs');
  return pages;
}

export default async function OgPreviewPage() {
  const h = await headers();
  const host = h.get('host') || 'localhost:3000';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${proto}://${host}`;

  const posts = getAllPosts();
  const essayPages = posts.map((p) => `/essays/${p.slug}`);
  const docPages = getDocPages();
  const allPages = [...staticPages, ...essayPages, ...docPages];

  return (
    <div style={{ padding: 40, fontFamily: 'system-ui', background: '#111' }}>
      <h1 style={{ color: '#fff', marginBottom: 40 }}>OG Image Preview</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))',
          gap: 32,
        }}
      >
        {allPages.map((p) => (
          <PagePreview key={p} path={p} baseUrl={baseUrl} />
        ))}
      </div>
    </div>
  );
}

function extractMetaContent(html: string, property: string, name: string) {
  const byProperty =
    html.match(
      new RegExp(
        `<meta[^>]*property="${property}"[^>]*content="([^"]*)"[^>]*>`,
      ),
    ) ||
    html.match(
      new RegExp(
        `<meta[^>]*content="([^"]*)"[^>]*property="${property}"[^>]*>`,
      ),
    );
  if (byProperty) return byProperty[1];

  const byName =
    html.match(
      new RegExp(`<meta[^>]*name="${name}"[^>]*content="([^"]*)"[^>]*>`),
    ) ||
    html.match(
      new RegExp(`<meta[^>]*content="([^"]*)"[^>]*name="${name}"[^>]*>`),
    );
  return byName?.[1];
}

function ImageCard({ src, label }: { src: string | undefined; label: string }) {
  if (!src) {
    return (
      <div>
        <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>
          {label}
        </div>
        <div
          style={{
            aspectRatio: '1200/630',
            background: '#222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          No image found
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      <img
        src={src}
        alt={label}
        style={{
          width: '100%',
          aspectRatio: '1200/630',
          objectFit: 'cover',
          borderRadius: 8,
          border: '1px solid #333',
        }}
      />
    </div>
  );
}

async function PagePreview({ path: pagePath, baseUrl }: { path: string; baseUrl: string }) {

  try {
    const res = await fetch(`${baseUrl}${pagePath}`, { cache: 'no-store' });
    const html = await res.text();

    const ogImage = extractMetaContent(html, 'og:image', 'og:image');
    const twitterImage = extractMetaContent(html, '', 'twitter:image');

    const resolve = (url: string | undefined) =>
      url && !url.startsWith('http') ? `${baseUrl}${url}` : url;

    const ogSrc = resolve(ogImage);
    const twitterSrc = resolve(twitterImage);
    const hasBoth = ogSrc && twitterSrc && ogSrc !== twitterSrc;

    return (
      <div>
        <div
          style={{
            color: '#aaa',
            marginBottom: 8,
            fontSize: 14,
            fontFamily: 'monospace',
          }}
        >
          {pagePath}
        </div>
        {hasBoth ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <ImageCard src={ogSrc} label="og:image" />
            </div>
            <div style={{ flex: 1 }}>
              <ImageCard src={twitterSrc} label="twitter:image" />
            </div>
          </div>
        ) : (
          <ImageCard src={ogSrc || twitterSrc} label="og:image" />
        )}
      </div>
    );
  } catch {
    return (
      <div>
        <div
          style={{
            color: '#aaa',
            marginBottom: 8,
            fontSize: 14,
            fontFamily: 'monospace',
          }}
        >
          {pagePath}
        </div>
        <div
          style={{
            aspectRatio: '1200/630',
            background: '#222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a33',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          Error fetching page
        </div>
      </div>
    );
  }
}
