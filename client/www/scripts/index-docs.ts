/*
 * Script for indexing documentation pages to Algolia
 * Usage: node index-docs.mjs --dry-run (saves objects to a file)
 * Usage: node index-docs.mjs (indexes objects to Algolia)
 * */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import algoliasearch from 'algoliasearch';
import { slugifyWithCounter } from '@sindresorhus/slugify';

import navigation from '../data/docsNavigation.js';
import Markdoc, { Node } from '@markdoc/markdoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const slugify = slugifyWithCounter();

const CONFIG = {
  ALGOLIA_API_KEY: process.env.ALGOLIA_API_KEY,
  ALGOLIA_APP_ID: '98PPX6H1AS',
  ALGOLIA_INDEX_NAME: 'docs',
  FILE_PATH: path.join(__dirname, 'algolia-objects.json'),
};

type AlgoliaObject = {
  content: string;
  type: 'lvl1' | 'lvl2';
  hierarchy: {
    lvl0?: string;
    lvl1?: string;
  };
  url: string;
  objectID: string;
};

type Section = {
  title: string;
  hash?: string;
  content: string[];
};

type PageInfo = {
  groupTitle: string;
  pageTitle: string;
  href: string;
  sections: Section[];
};

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const objects = toAlgoliaObjects(getPageInfos());
  if (isDryRun) {
    saveToFile(objects);
  } else {
    await saveToAlgolia(objects);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function saveToAlgolia(objects: AlgoliaObject[]) {
  if (!CONFIG.ALGOLIA_API_KEY) {
    throw new Error('Export ALGOLIA_API_KEY to run the script.');
  }

  const client = algoliasearch(CONFIG.ALGOLIA_APP_ID, CONFIG.ALGOLIA_API_KEY);
  const index = client.initIndex(CONFIG.ALGOLIA_INDEX_NAME);

  console.log('Replacing Index: ', CONFIG.ALGOLIA_INDEX_NAME);
  await index.replaceAllObjects(objects, {
    safe: true,
  });
  console.log('Indexed', objects.length, 'objects to Algolia');
}

function saveToFile(objects: AlgoliaObject[]) {
  console.log('Saving objects to file:', CONFIG.FILE_PATH);
  fs.writeFileSync(CONFIG.FILE_PATH, JSON.stringify(objects, null, 2));
  console.log('Saved', objects.length, 'objects to file');
}

// ---------
// toAlgoliaObjects

function toAlgoliaObjects(pages: PageInfo[]): AlgoliaObject[] {
  const objects = pages.flatMap(({ groupTitle, pageTitle, href, sections }) => {
    const [rootSection, ...restSections] = sections;
    const rootObject = {
      content: rootSection.content.join('\n'),
      hierarchy: {
        lvl0: groupTitle,
        lvl1: pageTitle,
      },
      type: 'lvl1',
      objectID: href,
      url: href,
    } satisfies AlgoliaObject;
    const restObjects = restSections.map(
      ({ title: subHeading, hash, content }) => {
        const url = `${href}#${hash || ''}`;
        const obj = {
          content: content.join('\n'),
          type: 'lvl1',
          hierarchy: {
            lvl0: pageTitle,
            lvl1: subHeading,
          },
          url,
          objectID: url,
        } satisfies AlgoliaObject;
        return obj;
      },
    );
    return [rootObject, ...restObjects];
  });

  return objects;
}

function getPageInfos(): PageInfo[] {
  return navigation.flatMap(({ title: groupTitle, links }) => {
    return links.map(({ title: pageTitle, href }) => {
      const mdPath = href === '/docs' ? '/docs/index' : href;
      const page = path.join(__dirname, '../pages', mdPath + '.md');
      const fileContents = fs.readFileSync(page, 'utf8');
      const ast = Markdoc.parse(fileContents);

      const sections = extractSections(ast, pageTitle);

      return {
        groupTitle,
        pageTitle,
        href,
        sections,
      };
    });
  });
}

function extractSections(ast: Node, pageTitle: string): Section[] {
  slugify.reset();

  const rootSection: Section = {
    title: pageTitle,
    content: [],
  };

  const sections = [rootSection];

  function walk(node: Node) {
    if (node.type === 'heading' && node.attributes.level <= 2) {
      const title = textContent(node);
      let hash = node.attributes?.id ?? slugify(title);
      sections.push({ title, hash, content: [] });
      return;
    }

    if (node.type === 'heading' || node.type === 'paragraph') {
      const content = textContent(node);

      sections.at(-1)!.content.push(content);
      return;
    }

    if (node.type === 'list') {
      const contents = node.children.map((child) => textContent(child));
      sections.at(-1)!.content.push(...contents);
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

function textContent(node: Node) {
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
      str += textContent(child);
    }
  }
  return str;
}
