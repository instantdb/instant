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
    url: 'https://twitter.com/DanielWoelfel',
  },
  nikitonsky: {
    name: 'Nikita Prokopov',
    url: 'https://mastodon.online/@nikitonsky',
  },
  instantdb: {
    name: 'Instant',
    url: 'https://x.com/instant_db'
  }
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
