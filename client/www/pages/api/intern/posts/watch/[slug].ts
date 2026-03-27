// SSE endpoint for live essay preview.
// Uses fs.watch to detect markdown file changes and pushes
// updated content to the client instantly, avoiding polling.
import fs from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getPostBySlug } from '../../../../../lib/posts';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug as string;
  const filePath = path.resolve(process.cwd(), `_posts/${slug}.md`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Post not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Encoding': 'none',
  });

  const send = () => {
    try {
      const post = getPostBySlug(slug);
      res.write(`data: ${JSON.stringify(post)}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {}
  };

  // Send initial data
  send();

  // Push on every file change
  let timeout: NodeJS.Timeout;
  const watcher = fs.watch(filePath, () => {
    clearTimeout(timeout);
    timeout = setTimeout(send, 50);
  });

  req.on('close', () => {
    watcher.close();
    clearTimeout(timeout);
  });
}
