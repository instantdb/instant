/*
  * Script for indexing documentation pages to Algolia
  * Usage: node index-docs.mjs
  * */

import path from 'path';
import fs from "fs";
import { fileURLToPath } from 'url';
import algoliasearch from 'algoliasearch';
import { slugifyWithCounter } from '@sindresorhus/slugify';

import navigation from "../data/docsNavigation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY;

if (!ALGOLIA_API_KEY) {
  throw new Error('Export ALGOLIA_API_KEY to run the script.');
}

const h2regex = /^#{2}(?!#)(.*)/gm;

const objects = []
navigation.forEach(({ title: group, links }) => {
  links.forEach(({ title: pageTitle, href }) => {

    // Index pages as top level
    objects.push({
      content: null,
      hierarchy: {
        lvl0: group,
        lvl1: pageTitle,
      },
      type: 'lvl1',
      objectID: href,
      url: href
    })

    const cleanHref = href === '/docs' ? '/docs/index' : href;
    const page = path.join(__dirname, '../pages', cleanHref + '.md')
    const fileContents = fs.readFileSync(page, 'utf8');
    fileContents.match(h2regex)?.forEach(match => {
      const pageHeading = match.substring(3); // Removes the '## ' from the heading
      const anchor = slugifyWithCounter()(pageHeading)
      const url = `${href}#${anchor}`;

      // Index h2 headings as sub-levels of the page
      // (XXX): Right now we don't index the content because it's mixed
      // with code blocks and templating syntax which creates noise. In the future
      // we should mark-up the content we want to index.
      objects.push({
        content: null,
        type: 'lvl2',
        hierarchy: {
          lvl0: group,
          lvl1: pageTitle,
          lvl2: pageHeading,
        },
        url,
        objectID: url
      });
    })

  })
})

const client = algoliasearch(
  '98PPX6H1AS',
  ALGOLIA_API_KEY
);
const index = client.initIndex("docs")
index.replaceAllObjects(objects, {
  safe: true
});

console.log("Indexed", objects.length, "objects to Algolia");
