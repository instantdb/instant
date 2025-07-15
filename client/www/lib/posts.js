import fs from 'fs';
import matter from 'gray-matter';
import _ from 'lodash';
import * as ReactDOMServer from 'react-dom/server';
import { marked } from 'marked';
import { Fence } from '../components/ui';
import footnotes from './footnotes';
import videos from './videos';

marked.use({
  renderer: {
    code(code, language) {
      return ReactDOMServer.renderToString(
        <Fence code={code} language={language}></Fence>,
      );
    },
    ...footnotes,
    ...videos,
  },
});

const AUTHORS = {
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

function getAuthors(authorStr) {
  return authorStr.split(',').map((x) => AUTHORS[x.trim()]);
}

export function getPostBySlug(slug) {
  const file = fs.readFileSync(`./_posts/${slug}.md`, 'utf-8');
  const { data, content } = matter(file);
  return {
    slug,
    ...data,
    authors: getAuthors(data.authors),
    content,
  };
}

function removeMdExtension(str) {
  return str.replace(/\.md$/, '');
}

// Instead of deleting posts, we can just exclude them
const archivedSlugs = ['stroop'];

export function getAllSlugs() {
  const dir = fs.readdirSync('./_posts');
  return dir
    .map((mdName) => removeMdExtension(mdName))
    .filter((slug) => !archivedSlugs.includes(slug));
}

export function getAllPosts() {
  const posts = getAllSlugs().map((slug) => getPostBySlug(slug));
  return _.orderBy(posts, 'date', 'desc').map((p) => _.omit(p, 'content'));
}
