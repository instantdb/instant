import fs from 'fs';
import matter from 'gray-matter';
import _ from 'lodash';

export interface Author {
  name: string;
  url: string;
  avatar: string;
}

export interface Post {
  title: string;
  slug: string;
  date: string;
  content: string;
  authors: Author[];
  duration: {
    minutes: number;
    type: 'read' | 'watch';
  };
  isDraft?: boolean;
  summary?: string;
  thumbnail?: string;
  hero?: string;
  watch_time?: number;
  og_image?: string;
}

const AUTHORS: Record<string, Author> = {
  stopachka: {
    name: 'Stepan Parunashvili',
    url: 'https://x.com/stopachka',
    avatar: '/img/landing/stopa.jpg',
  },
  nezaj: {
    name: 'Joe Averbukh',
    url: 'https://x.com/JoeAverbukh',
    avatar: '/img/landing/joe.jpg',
  },
  dww: {
    name: 'Daniel Woelfel',
    url: 'https://twitter.com/DanielWoelfel',
    avatar: '/img/landing/daniel.png',
  },
  nikitonsky: {
    name: 'Nikita Prokopov',
    url: 'https://mastodon.online/@nikitonsky',
    avatar: '/img/peeps/nikitonsky.jpeg',
  },
  instantdb: {
    name: 'Instant',
    url: 'https://x.com/instant_db',
    avatar: '/img/icon/logo-512.svg',
  },
};

function getAuthors(authorStr: string): Author[] {
  return authorStr.split(',').map((x) => AUTHORS[x.trim()]);
}

function getDuration(content: string, watchTime?: number): Post['duration'] {
  return {
    minutes:
      watchTime ?? Math.max(1, Math.round(content.split(/\s+/).length / 250)),
    type: watchTime ? 'watch' : 'read',
  };
}

function definedPostFields(fields: Partial<Post>): Partial<Post> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<Post>;
}

export function getPostBySlug(slug: string): Post {
  const file = fs.readFileSync(`./_posts/${slug}.md`, 'utf-8');
  const { data, content } = matter(file);

  return {
    slug,
    title: data.title,
    date: data.date,
    authors: getAuthors(data.authors),
    content,
    duration: getDuration(content, data.watch_time),
    ...definedPostFields({
      isDraft: data.isDraft,
      summary: data.summary,
      thumbnail: data.thumbnail,
      hero: data.hero,
      watch_time: data.watch_time,
      og_image: data.og_image,
    }),
  };
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
