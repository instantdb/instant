import fs from 'fs';
import matter from 'gray-matter';
import _ from 'lodash';
import * as ReactDOMServer from 'react-dom/server';
import { marked } from 'marked';
import { Fence } from '../components/ui';
import footnotesExtension from '@/lib/footnotes';

function removeMdExtension(str) {
  return str.replace(/\.md$/, '');
}

// Configure marked with extensions
marked.use(footnotesExtension);
marked.use({
  renderer: {
    code(token) {
      return ReactDOMServer.renderToString(
        <Fence code={token.text} language={token.lang || ''}></Fence>,
      );
    },
  },
});

export function getHTML(slug) {
  try {
    const file = fs.readFileSync(`./_emails/markdown/${slug}.md`, 'utf-8');
    const { content } = matter(file);
    return marked(content);
  } catch (e) {
    return null;
  }
}

export function getText(slug) {
  try {
    const file = fs.readFileSync(`./_emails/txt/${slug}.txt`, 'utf-8');
    return file;
  } catch (e) {
    return null;
  }
}

export function getAllSlugs() {
  const dir = fs.readdirSync(`./_emails/markdown`);
  return dir
    .filter((f) => f.endsWith('.md'))
    .map((mdName) => removeMdExtension(mdName));
}
