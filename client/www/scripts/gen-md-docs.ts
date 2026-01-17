/**
 * Exports our docs to public/docs directory and transforms the content
 * to be markdown compatible with LLMs.
 *
 * Usage: pnpm exec tsx scripts/gen-md-docs.ts
 */

import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { transformContent } from '../lib/markdoc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  DOCS_PATH: path.resolve(__dirname, '../pages/docs'),
  OUTPUT_PATH: path.resolve(__dirname, '../public/docs'),
  PUBLIC_PATH: path.resolve(__dirname, '../public'),
};

async function findMarkdownFiles(dir: string): Promise<string[]> {
  let results: string[] = [];

  try {
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        const subResults = await findMarkdownFiles(fullPath);
        results = [...results, ...subResults];
      } else if (item.isFile() && item.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }

  return results;
}

async function exportDocsToPublic(): Promise<void> {
  const markdownFiles = await findMarkdownFiles(CONFIG.DOCS_PATH);
  console.log(`Found ${markdownFiles.length} markdown files in docs directory`);

  for (const sourceFilePath of markdownFiles) {
    try {
      const content = await fs.readFile(sourceFilePath, 'utf8');
      const transformedContent = transformContent(content);

      const relativePath = path.relative(CONFIG.DOCS_PATH, sourceFilePath);

      // Special case for index.md - also save it as docs.md in the public root
      if (relativePath === 'index.md') {
        const docsRootPath = path.join(CONFIG.PUBLIC_PATH, 'docs.md');
        await fs.writeFile(docsRootPath, transformedContent);
      }

      const outputPath = path.join(CONFIG.OUTPUT_PATH, relativePath);

      // For handling subdirectorys like docs/auth/apple
      const outputDir = path.dirname(outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      await fs.writeFile(outputPath, transformedContent);
      console.log(`Exported: ${relativePath}`);
    } catch (error) {
      console.error(`Error processing file ${sourceFilePath}:`, error);
    }
  }
}

async function main() {
  try {
    console.log('Starting docs export to public/docs...');

    // Make sure the output directory exists
    if (!existsSync(CONFIG.OUTPUT_PATH)) {
      mkdirSync(CONFIG.OUTPUT_PATH, { recursive: true });
    }

    await exportDocsToPublic();
    console.log(`Successfully exported markdown docs to ${CONFIG.OUTPUT_PATH}`);
  } catch (error) {
    console.error('Failed to export docs:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error in main function:', error);
    process.exit(1);
  });
}
