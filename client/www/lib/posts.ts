import fs from 'fs';
import matter from 'gray-matter';
import _ from 'lodash';

export interface Author {
  name: string;
  url: string;
  avatar?: string;
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
    avatar: '/img/landing/daniel.png',
  },
};

function getAuthors(authorStr: string): Author[] {
  return authorStr.split(',').map((x) => AUTHORS[x.trim()]);
}

export function getPostBySlug(slug: string): Post {
  const file = fs.readFileSync(`./_posts/${slug}.md`, 'utf-8');
  const { data, content } = matter(file);

  const post: Post = {
    slug,
    title: data.title,
    date: data.date,
    authors: getAuthors(data.authors),
    content: content,
    duration: {
      minutes:
        data.watch_time ??
        Math.max(1, Math.round(content.split(/\s+/).length / 250)),
      type: data.watch_time ? 'watch' : 'read',
    },
  };

  // Only add optional fields if they exist
  if (data.isDraft) post.isDraft = data.isDraft;
  if (data.summary) post.summary = data.summary;
  if (data.thumbnail) post.thumbnail = data.thumbnail;
  if (data.hero) post.hero = data.hero;
  if (data.watch_time) post.watch_time = data.watch_time;
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
