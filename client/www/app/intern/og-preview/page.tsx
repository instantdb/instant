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
  title: string;
  description?: string;
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
          const { data } = matter(fs.readFileSync(mdPath, 'utf-8'));
          const meta = data?.nextjs?.metadata;
          entries.push({
            path: `${prefix}/${entry.name}`,
            title: meta?.title || entry.name,
            description: meta?.description,
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
      title: p.title,
      description: p.summary,
      ogImage,
    };
  });
}

const staticPaths = [
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

function parseMetaFromFile(filePath: string): {
  title?: string;
  description?: string;
} {
  try {
    const src = fs.readFileSync(filePath, 'utf-8');
    const titleMatch =
      src.match(/title:\s*['"`]([^'"`]+)['"`]/) ||
      src.match(/title\s*=\s*['"`]([^'"`]+)['"`]/);
    const descMatch =
      src.match(/description:\s*['"`]([^'"`]+)['"`]/) ||
      src.match(/description\s*=\s*\n?\s*['"`]([^'"`]+)['"`]/);
    return {
      title: titleMatch?.[1],
      description: descMatch?.[1],
    };
  } catch {
    return {};
  }
}

function getStaticPages(): PageEntry[] {
  return staticPaths.map((p) => {
    const filePath = path.join(
      process.cwd(),
      'app',
      p === '/' ? '' : p,
      'page.tsx',
    );
    const meta = parseMetaFromFile(filePath);
    return {
      path: p,
      title: meta.title || p,
      description: meta.description,
      ogImage: '/opengraph-image',
    };
  });
}

export default function OgPreviewPage() {
  const allEntries = [
    ...getStaticPages(),
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
                  <OgPanel
                    entry={entry}
                    imageSrc={entry.ogImage}
                    label="og:image"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <OgPanel
                    entry={entry}
                    imageSrc={entry.twitterImage}
                    label="twitter:image"
                  />
                </div>
              </div>
            ) : (
              <OgPanel
                entry={entry}
                imageSrc={entry.ogImage}
                label="og:image"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OgPanel({
  entry,
  imageSrc,
  label,
}: {
  entry: PageEntry;
  imageSrc: string;
  label: string;
}) {
  return (
    <div>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      <a
        href={entry.path}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          borderRadius: 8,
          border: '1px solid #333',
          overflow: 'hidden',
          background: '#1a1a1a',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={label}
          style={{
            width: '100%',
            aspectRatio: '1200/630',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        <div style={{ padding: '12px 16px' }}>
          <div
            style={{
              color: '#888',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            instantdb.com
          </div>
          <div
            style={{
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: entry.description ? 4 : 0,
            }}
          >
            {entry.title}
          </div>
          {entry.description ? (
            <div
              style={{
                color: '#888',
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.description}
            </div>
          ) : null}
        </div>
      </a>
    </div>
  );
}
