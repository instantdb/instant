import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFile, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';

const scriptDir = dirname(fileURLToPath(import.meta.url));

// Resolve relative path
const relativePath = (path) => resolve(scriptDir, path);

export async function replaceImages(markdown) {
  const processor = unified()
    .use(remarkParse)
    .use(imgModifier)
    .use(remarkStringify);

  const result = await processor.process(markdown);
  return String(result);
}

async function writeImage(href) {
  const fileName = new URL(href).pathname;
  console.log('downloading image', fileName);
  const path = relativePath(`../../public/img/emails${fileName}`);
  const response = await fetch(href);
  const stream = Readable.fromWeb(response.body);
  await writeFile(path, stream);

  return `https://www.instantdb.com/img/emails${fileName}`;
}

function imgModifier() {
  return async (tree) => {
    const visit = async (node) => {
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          await visit(child);
        }
      }
      if (
        node.type === 'image' &&
        node.url?.startsWith('https://paper-attachments.dropboxusercontent.com')
      ) {
        const newUrl = await writeImage(node.url);
        node.url = newUrl;
      }
    };
    await visit(tree);
  };
}

export async function run(slug) {
  const path = relativePath(`../markdown/${slug}.md`);
  const markdown = await readFile(path);
  const updatedMarkdown = await replaceImages(markdown);
  await writeFile(path, updatedMarkdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const slug = process.argv[2];
  await run(slug);
}
