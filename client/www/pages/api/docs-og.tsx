import type { NextApiRequest, NextApiResponse } from 'next';
import { generateOgImage } from '@/lib/ogImage';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const slug = req.query.slug as string | undefined;

  if (!slug || !/^[\w\-\/]+$/.test(slug)) {
    return res.status(404).end('Not found');
  }

  const mdPath = slug === 'index'
    ? path.join(process.cwd(), 'app', 'docs', 'page.md')
    : path.join(process.cwd(), 'app', 'docs', slug, 'page.md');

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
