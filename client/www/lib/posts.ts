import fs from 'fs';
import matter from 'gray-matter';
import _ from 'lodash';

export interface Author {
  name: string;
  url: string;
}

export interface Post {
  title: string;
  slug: string;
  date: string;
  content: string;
  authors: Author[];
  isDraft?: boolean;
  hero?: string;
  og_image?: string;
}

const AUTHORS: Record<string, Author> = {
  stopachka: {
    name: 'Stepan Parunashvili',
    url: 'https://x.com/stopachka',
  },
  nezaj: {
    name: 'Joe Averbukh',
    url: 'https://x.com/JoeAverbukh',
  },
  dww: {
    name: 'Daniel Woelfel',
    url: 'https://x.com/DanielWoelfel',
  },
  nikitonsky: {
    name: 'Nikita Prokopov',
    url: 'https://mastodon.online/@nikitonsky',
  },
};

function getAuthors(authorStr: string): Author[] {
  return authorStr.split(',').map((x) => AUTHORS[x.trim()]);
}

function transformTranscript(content: string): string {
  // Check for ::transcript directive
  const transcriptMatch = content.match(
    /^::transcript\s+([A-Za-z0-9_-]+)\s*$/m,
  );

  if (!transcriptMatch) {
    return content;
  }

  const videoId = transcriptMatch[1];

  // Remove the ::transcript line from content
  let transformedContent = content
    .replace(/^::transcript\s+[A-Za-z0-9_-]+\s*$/m, '')
    .trim();

  // Replace all timestamp patterns [HH:MM:SS] with YouTube links
  transformedContent = transformedContent.replace(
    /\[(\d{2}):(\d{2}):(\d{2})\]/g,
    (match, hours, minutes, seconds) => {
      const totalSeconds =
        parseInt(hours, 10) * 3600 +
        parseInt(minutes, 10) * 60 +
        parseInt(seconds, 10);

      return `[${match.slice(1, -1)}](https://youtube.com/watch?v=${videoId}&t=${totalSeconds}s)`;
    },
  );

  return transformedContent;
}

export function getPostBySlug(slug: string): Post {
  const file = fs.readFileSync(`./_posts/${slug}.md`, 'utf-8');
  const { data, content } = matter(file);

  // Transform transcript timestamps if present
  const transformedContent = transformTranscript(content);

  const post: Post = {
    slug,
    title: data.title,
    date: data.date,
    authors: getAuthors(data.authors),
    content: transformedContent,
  };

  // Only add optional fields if they exist
  if (data.isDraft) post.isDraft = data.isDraft;
  if (data.hero) post.hero = data.hero;
  if (data.og_image) post.og_image = data.og_image;

  return post;
}

function removeMdExtension(str: string): string {
  return str.replace(/\.md$/, '');
}

// Instead of deleting posts, we can just exclude them
const archivedSlugs = ['stroop'];

export function getAllSlugs(): string[] {
  const dir = fs.readdirSync('./_posts');
  return dir
    .map((mdName) => removeMdExtension(mdName))
    .filter((slug) => !archivedSlugs.includes(slug));
}

export function getAllPosts(): Omit<Post, 'content'>[] {
  const posts = getAllSlugs().map((slug) => getPostBySlug(slug));
  return _.orderBy(posts, 'date', 'desc').map((p) => _.omit(p, 'content'));
}
