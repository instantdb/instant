import type { NextApiRequest, NextApiResponse } from 'next';
import { generateOgImage } from '@/lib/ogImage';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

function findDocPage(slug: string): string {
  const docsDir = path.join(process.cwd(), 'app', 'docs');

  if (slug === 'index') {
    return path.join(docsDir, 'page.md');
  }

  // Direct match: app/docs/<slug>/page.md
  const direct = path.join(docsDir, slug, 'page.md');
  if (fs.existsSync(direct)) return direct;

  // Dynamic route match: app/docs/<slug>/[[...tab]]/page.md etc.
  const slugDir = path.join(docsDir, slug);
  if (fs.existsSync(slugDir)) {
    for (const entry of fs.readdirSync(slugDir)) {
      if (entry.startsWith('[') && fs.existsSync(path.join(slugDir, entry, 'page.md'))) {
        return path.join(slugDir, entry, 'page.md');
      }
    }
  }

  return direct; // will fail in the caller's try/catch
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const slug = req.query.slug as string | undefined;

  if (!slug || !/^[\w\-\/]+$/.test(slug)) {
    return res.status(404).end('Not found');
  }

  const mdPath = findDocPage(slug);

  let title: string;
  try {
    const file = fs.readFileSync(mdPath, 'utf-8');
    const { data } = matter(file);
    title = data?.nextjs?.metadata?.title || slug.split('/').pop() || 'Docs';
  } catch {
    return res.status(404).end('Not found');
  }

  const imageResponse = await generateOgImage({
    title,
    layout: 'centered',
  });

  const buffer = await imageResponse.arrayBuffer();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(Buffer.from(buffer));
}
