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

import { metadata as metaRoot } from '../page';
import { metadata as metaAbout } from '../about/page';
import { metadata as metaEssays } from '../essays/page';
import { metadata as metaExamples } from '../examples/page';
import { metadata as metaHiring } from '../hiring/page';
import { metadata as metaHiringBe } from '../hiring/backend-engineer/page';
import { metadata as metaPricing } from '../pricing/page';
import { metadata as metaAdminSdk } from '../product/admin-sdk/page';
import { metadata as metaAuth } from '../product/auth/page';
import { metadata as metaDatabase } from '../product/database/page';
import { metadata as metaStorage } from '../product/storage/page';
import { metadata as metaSync } from '../product/sync/page';
import { metadata as metaRecipes } from '../recipes/page';
import { metadata as metaTutorial } from '../tutorial/page';

function extractMeta(meta: Metadata): { title: string; description?: string } {
  const title =
    (typeof meta.title === 'string' ? meta.title : (meta.title as any)?.default) ||
    meta.openGraph?.title ||
    '';
  const description = (meta.description || meta.openGraph?.description) as string | undefined;
  return { title: String(title), description };
}

const staticPages: PageEntry[] = ([
  ['/', metaRoot],
  ['/about', metaAbout],
  ['/essays', metaEssays],
  ['/examples', metaExamples],
  ['/hiring', metaHiring],
  ['/hiring/backend-engineer', metaHiringBe],
  ['/pricing', metaPricing],
  ['/product/admin-sdk', metaAdminSdk],
  ['/product/auth', metaAuth],
  ['/product/database', metaDatabase],
  ['/product/storage', metaStorage],
  ['/product/sync', metaSync],
  ['/recipes', metaRecipes],
  ['/tutorial', metaTutorial],
] as [string, Metadata][]).map(([p, meta]) => ({
  path: p,
  ...extractMeta(meta),
  ogImage: '/opengraph-image',
}));

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
                  <OgPanel entry={entry} imageSrc={entry.ogImage} label="og:image" />
                </div>
                <div style={{ flex: 1 }}>
                  <OgPanel entry={entry} imageSrc={entry.twitterImage} label="twitter:image" />
                </div>
              </div>
            ) : (
              <OgPanel entry={entry} imageSrc={entry.ogImage} label="og:image" />
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
      <div
        style={{
          borderRadius: 8,
          border: '1px solid #333',
          overflow: 'hidden',
          background: '#1a1a1a',
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
      </div>
    </div>
  );
}
