import fs from 'fs';
import matter from 'gray-matter';
import _ from 'lodash';
import * as ReactDOMServer from 'react-dom/server';
import { marked } from 'marked';
import { Fence } from '../components/ui';
import footnotes from './footnotes';

function removeMdExtension(str) {
  return str.replace(/\.md$/, '');
}

marked.use({
  renderer: {
    code(code, language) {
      return ReactDOMServer.renderToString(
        <Fence code={code} language={language}></Fence>,
      );
    },
    ...footnotes,
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
