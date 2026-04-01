import type { Metadata } from 'next';
import { getAllPosts } from '@/lib/posts';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export const metadata: Metadata = {
  title: 'OG Image Preview',
  robots: 'noindex',
};

type PageEntry = {
  path: string;
  ogImage: string;
  twitterImage?: string;
};

function getDocEntries(): PageEntry[] {
  const docsDir = path.join(process.cwd(), 'app', 'docs');
  const entries: PageEntry[] = [];

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const sub = path.join(dir, entry.name);
        const mdPath = path.join(sub, 'page.md');
        if (fs.existsSync(mdPath)) {
          const slug = `${prefix}/${entry.name}`.replace('/docs/', '');
          entries.push({
            path: `${prefix}/${entry.name}`,
            ogImage: `/api/docs-og?slug=${encodeURIComponent(slug)}`,
          });
        }
        walk(sub, `${prefix}/${entry.name}`);
      }
    }
  }

  walk(docsDir, '/docs');
  return entries;
}

function getEssayEntries(): PageEntry[] {
  const posts = getAllPosts();
  return posts.map((p) => {
    const ogImage = p.og_image || p.hero || p.thumbnail || '/opengraph-image';
    return {
      path: `/essays/${p.slug}`,
      ogImage,
      twitterImage: `/essays/${p.slug}/twitter-image`,
    };
  });
}

const staticPages: PageEntry[] = [
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
].map((p) => ({ path: p, ogImage: '/opengraph-image' }));

export default function OgPreviewPage() {
  const allEntries = [
    ...staticPages,
    ...getEssayEntries(),
    ...getDocEntries(),
  ];

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
        {allEntries.map((entry) => (
          <div key={entry.path}>
            <div
              style={{
                color: '#aaa',
                marginBottom: 8,
                fontSize: 14,
                fontFamily: 'monospace',
              }}
            >
              {entry.path}
            </div>
            {entry.twitterImage && entry.twitterImage !== entry.ogImage ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <ImageCard src={entry.ogImage} label="og:image" />
                </div>
                <div style={{ flex: 1 }}>
                  <ImageCard src={entry.twitterImage} label="twitter:image" />
                </div>
              </div>
            ) : (
              <ImageCard src={entry.ogImage} label="og:image" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageCard({ src, label }: { src: string; label: string }) {
  return (
    <div>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
