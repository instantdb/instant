/**
 * Script for generating rss.xml based on our blog posts
 *
 * Reads all blog posts from the _posts directory and generates
 * an RSS feed with content for each post.
 *
 * The output file is saved in the public directory.
 *
 * Usage: pnpm exec tsx scripts/gen-rss.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import { marked } from 'marked';
import { getAllPosts, getPostBySlug } from '@/lib/posts';
import type { Post } from '@/lib/posts';
import footnotesExtension from '@/lib/footnotes';
import videosExtension from '@/lib/videos';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  OUTPUT_PATH: path.resolve(__dirname, '../public'),
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateToRFC822(dateString: string): string {
  // Convert date string to RFC 822 format required by RSS 2.0 spec
  return format(
    parse(dateString, 'yyyy-MM-dd', new Date()),
    "EEE, dd MMM yyyy HH:mm:ss 'GMT'",
  );
}

// (TODO): It would be really nice to support code highlighting too
// but I had build issues with including JSX / the Fence component.
marked.use(footnotesExtension);
marked.use(videosExtension);

function generateRssFeed(posts: Omit<Post, 'content'>[]): string {
  const siteUrl = 'https://instantdb.com';
  const feedUrl = `${siteUrl}/essays`;

  // Use the most recent post date as lastBuildDate
  // This ensures the date only changes when there's actually new content
  const latestPost = posts[0];
  const lastBuildDate = latestPost
    ? formatDateToRFC822(latestPost.date)
    : new Date().toUTCString();

  const rssItems = posts
    .filter(({ isDraft }) => !isDraft)
    .map(({ slug }) => {
      const fullPost = getPostBySlug(slug);
      const { title, date, authors, content } = fullPost;

      const pubDate = formatDateToRFC822(date);

      const authorNames = authors.map((author) => author.name).join(', ');
      const htmlContent = marked(content, { async: false });

      return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${siteUrl}/essays/${slug}</link>
      <guid isPermaLink="true">${siteUrl}/essays/${slug}</guid>
      <description>${escapeXml(htmlContent)}</description>
      <pubDate>${pubDate}</pubDate>
      <author>${escapeXml(authorNames)}</author>
    </item>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Instant Essays</title>
    <link>${feedUrl}</link>
    <description>Essays from the Instateam</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;
}

async function generateRSSFile(): Promise<void> {
  const posts = getAllPosts();
  console.log(`Found ${posts.length} blog posts`);

  const nonDraftPosts = posts.filter(({ isDraft }) => !isDraft);
  console.log(`Processing ${nonDraftPosts.length} published posts`);

  const feed = generateRssFeed(posts);

  console.log('Writing RSS feed...');
  await fs.writeFile(path.join(CONFIG.OUTPUT_PATH, 'rss.xml'), feed);
}

async function main() {
  try {
    console.log('Starting RSS generator...');
    await generateRSSFile();
    console.log(`Successfully generated rss.xml in ${CONFIG.OUTPUT_PATH}`);
  } catch (error) {
    console.error('Failed to generate RSS feed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error in main function:', error);
  process.exit(1);
});
