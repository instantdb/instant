/**
 * Script for generating llms.txt and llms-full.txt based on our docs
 *
 * Reads markdown files from the docs directory and
 *
 * 1) Generates llms.txt with the titles and descriptions of each document
 * 2) Generates llms-full.txt with the full content of each document
 * concatenated together
 *
 * The output files are saved in the public directory. Sections are in the same
 * order as our docs navigation.
 *
 * Usage: pnpm exec tsx gen-llms-txt.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import navigation from '../data/docsNavigation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  DOCS_PATH: path.resolve(__dirname, '../pages/docs'),
  OUTPUT_PATH: path.resolve(__dirname, '../public'),
};

interface Document {
  title: string;
  description: string;
  content: string;
  url: string;
  href: string;
}

function parseFrontmatter(content: string): {
  frontmatter: any;
  content: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content };
  }

  const frontmatterStr = match[1];
  const remainingContent = match[2];

  const frontmatter: Record<string, string> = {};
  const lines = frontmatterStr.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: remainingContent };
}

function transformContent(content: string): string {
  const { frontmatter, content: markdownContent } = parseFrontmatter(content);
  let result = '';

  if (frontmatter.title) {
    result += `# ${frontmatter.title}\n\n`;
  }

  if (frontmatter.description) {
    result += `${frontmatter.description}\n\n`;
  }

  return result + markdownContent;
}

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

function getDocumentUrl(href: string): string {
  return `https://instantdb.com${href}`;
}

async function processMarkdownFile(filePath: string): Promise<Document | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);

    if (!frontmatter.title) {
      console.warn(`No title found in frontmatter for ${filePath}`);
      return null;
    }

    // Calculate the href (relative path within docs)
    const relativePath = path.relative(CONFIG.DOCS_PATH, filePath);
    const urlPath = relativePath.replace(/\\/g, '/').replace(/\.md$/, '');

    const href = urlPath.endsWith('index') ? '/docs' : `/docs/${urlPath}`;

    const url = getDocumentUrl(href);

    return {
      title: frontmatter.title,
      description: frontmatter.description || '',
      content: transformContent(content),
      url,
      href,
    };
  } catch (error) {
    console.error(`Error processing markdown file ${filePath}:`, error);
    return null;
  }
}

// Generate llms.txt and llms-full.txt
// Sections are in the same order as our docs
async function generateLLMsFiles(): Promise<void> {
  console.log(`Loaded navigation with ${navigation.length} sections`);

  const markdownFiles = await findMarkdownFiles(CONFIG.DOCS_PATH);
  console.log(`Found ${markdownFiles.length} markdown files in docs directory`);

  const documents: Document[] = [];
  for (const filePath of markdownFiles) {
    const document = await processMarkdownFile(filePath);
    if (document) {
      documents.push(document);
    }
  }

  console.log(`Processed ${documents.length} valid markdown documents`);

  const documentMap: Record<string, Document> = {};
  for (const doc of documents) {
    documentMap[doc.href] = doc;
  }

  // Generate llms.txt
  let llmsContent = `# InstantDB\n\n`;
  llmsContent += `> Instant is a modern Firebase. We make you productive by giving your frontend a real-time database. Below is a reference for documentation on using Instant.\n\n`;

  const allLinks = navigation.flatMap((section) => (section as any).links);
  const reqLinks = allLinks.filter((link) => !(link as any).optionalLLM);
  const optLinks = allLinks.filter((link) => (link as any).optionalLLM);

  llmsContent += '## Docs\n\n';
  for (const link of reqLinks) {
    const doc = documentMap[link.href];
    if (doc) {
      llmsContent += `- [${doc.title}](${doc.url})${
        doc.description ? `: ${doc.description}` : ''
      }\n`;
    } else {
      console.warn(`No document found for href: ${link.href}`);
    }
  }

  llmsContent += '\n\n## Optional\n\n';
  for (const link of optLinks) {
    const doc = documentMap[link.href];
    if (doc) {
      llmsContent += `- [${doc.title}](${doc.url})${
        doc.description ? `: ${doc.description}` : ''
      }\n`;
    } else {
      console.warn(`No document found for href: ${link.href}`);
    }
  }

  // Generate llms-full.txt
  let llmsFullContent = '';
  for (const link of allLinks) {
    const doc = documentMap[link.href];
    if (doc) {
      llmsFullContent += `${doc.content}\n\n`;
    }
  }

  console.log('Writing files...');

  await fs.writeFile(path.join(CONFIG.OUTPUT_PATH, 'llms.txt'), llmsContent);
  await fs.writeFile(
    path.join(CONFIG.OUTPUT_PATH, 'llms-full.txt'),
    llmsFullContent,
  );
}

async function main() {
  try {
    console.log('Starting LLMs.txt generator...');
    await generateLLMsFiles();
    console.log(
      `Successfully generated llms.txt and llms-full.txt in ${CONFIG.OUTPUT_PATH}`,
    );
  } catch (error) {
    console.error('Failed to generate LLMs files:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error in main function:', error);
    process.exit(1);
  });
}
