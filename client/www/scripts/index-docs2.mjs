/*
 * Script for indexing documentation pages to Algolia
 * Usage: node index-docs.mjs
 * */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import algoliasearch from 'algoliasearch';
import { slugifyWithCounter } from '@sindresorhus/slugify';

import navigation from '../data/docsNavigation.js';
import Markdoc from '@markdoc/markdoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY;

if (!ALGOLIA_API_KEY) {
  throw new Error('Export ALGOLIA_API_KEY to run the script.');
}

const slugify = slugifyWithCounter();

function allowedTextContent(node) {
  let str = '';
  if (node.type === 'text' && typeof node.attributes?.content === 'string') {
    str += node.attributes.content;
  } else if (node.type === 'tag' && node.tag === 'blank-link') {
    str += node.attributes.label;
  } else if (
    node.type === 'code' &&
    typeof node.attributes?.content === 'string'
  ) {
    str += node.attributes.content;
  }
  if ('children' in node) {
    for (let child of node.children) {
      str += allowedTextContent(child);
    }
  }
  return str;
}

function extractSections(ast, rootSection) {
  slugify.reset();

  const sections = [rootSection];

  function walk(node) {
    if (node.type === 'heading' && node.attributes.level <= 2) {
      const title = allowedTextContent(node);
      let hash = node.attributes?.id ?? slugify(title);
      sections.push({ title, hash, content: [] });
      return;
    }

    if (node.type === 'heading' || node.type === 'paragraph') {
      const content = allowedTextContent(node);

      sections.at(-1).content.push(content);
      return;
    }

    if (node.type === 'list') {
      const contents = node.children.map((child) => allowedTextContent(child));
      sections.at(-1).content.push(...contents);
    }

    if ('children' in node) {
      for (let child of node.children) {
        walk(child);
      }
      return;
    }
  }

  walk(ast);

  return sections;
}

const pages = navigation.flatMap(({ title: group, links }) => {
  return links.map(({ title: pageTitle, href }) => {
    const cleanHref = href === '/docs' ? '/docs/index' : href;
    const page = path.join(__dirname, '../pages', cleanHref + '.md');
    const fileContents = fs.readFileSync(page, 'utf8');
    const ast = Markdoc.parse(fileContents);

    const sections = extractSections(ast, {
      title: pageTitle,
      hash: null,
      content: [],
    });

    return { sections };
  });
});

fs.writeFileSync('pages.json', JSON.stringify(pages, null, 2));

// const client = algoliasearch('98PPX6H1AS', ALGOLIA_API_KEY);
// const index = client.initIndex('docs_dev');
// index.replaceAllObjects(objects, {
//   safe: true,
// });

// console.log('Indexed', objects.length, 'objects to Algolia');
