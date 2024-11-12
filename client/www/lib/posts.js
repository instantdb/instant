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
        <Fence code={code} language={language}></Fence>
      );
    },
    ...footnotes,
    ...videos,
  },
});

const AUTHORS = {
  stopachka: {
    name: 'Stepan Parunashvili',
    twitterHandle: 'stopachka',
  },
  nezaj: {
    name: 'Joe Averbukh',
    twitterHandle: 'JoeAverbukh',
  },
};

function getPostBySlug(slug) {
  const file = fs.readFileSync(`./_posts/${slug}.md`, 'utf-8');
  const { data, content } = matter(file);
  return {
    slug,
    ...data,
    author: AUTHORS[data.author],
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
  return dir.map((mdName) => removeMdExtension(mdName)).filter((slug) => !archivedSlugs.includes(slug));
}

export function getHTMLPostBySlug(slug) {
  const p = getPostBySlug(slug);
  return {
    ..._.omit(p, 'content'),
    mdHTML: marked(p.content),
  };
}

export function getAllPosts() {
  const posts = getAllSlugs().map((slug) => getPostBySlug(slug));
  return _.orderBy(posts, 'date', 'desc').map((p) => _.omit(p, 'content'));
}
