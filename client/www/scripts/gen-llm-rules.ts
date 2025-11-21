/**
 * Script for generating LLM rule files for different IDEs.
 *
 * Takes a single markdown file (instant-rules.md) and generates versions
 * with IDE-specific frontmatter for Cursor and Windsurf.
 *
 * Output files are saved to:
 * - public/llm-rules/
 * - packages/create-instant-app/template/rules/
 *
 * Usage: pnpm exec tsx scripts/gen-llm-rules.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const TEMPLATE_PATH = path.join(__dirname, '../lib/intern/instant-rules.md');
const BASE_PUBLIC_RULES_PATH = path.join(__dirname, '../public/llm-rules');
const BASE_CREATE_INSTANT_APP_PATH = path.join(
  __dirname,
  '../../packages/create-instant-app/template/rules',
);

// Frontmatter templates
const CURSOR_FRONTMATTER = `---
description:
globs:
alwaysApply: true
---

`;

const WINDSURF_FRONTMATTER = `---
trigger: always_on
description: How to use InstantDB
globs: ['**/*.tsx', '**/*.ts']
---

`;

async function generateLLMRuleFiles() {
  console.log('Reading base rules file...');

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template file not found: ${TEMPLATE_PATH}`);
  }

  const baseContent = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  if (!baseContent || baseContent.trim().length === 0) {
    throw new Error('Template file is empty');
  }

  const files = [
    { filename: 'AGENTS.md', content: baseContent },
    { filename: 'cursor-rules.md', content: CURSOR_FRONTMATTER + baseContent },
    {
      filename: 'windsurf-rules.md',
      content: WINDSURF_FRONTMATTER + baseContent,
    },
  ];

  // Ensure output directories exist
  if (!fs.existsSync(BASE_PUBLIC_RULES_PATH)) {
    fs.mkdirSync(BASE_PUBLIC_RULES_PATH, { recursive: true });
  }
  if (!fs.existsSync(BASE_CREATE_INSTANT_APP_PATH)) {
    fs.mkdirSync(BASE_CREATE_INSTANT_APP_PATH, { recursive: true });
  }

  // Generate all files
  console.log('Generating LLM rule files...');
  for (const { filename, content } of files) {
    // Write to public directory
    const publicPath = path.join(BASE_PUBLIC_RULES_PATH, filename);
    fs.writeFileSync(publicPath, content);
    console.log(`  ✅ Generated: ${filename} in ${BASE_PUBLIC_RULES_PATH}`);

    // Write to create-instant-app
    const createInstantAppPath = path.join(
      BASE_CREATE_INSTANT_APP_PATH,
      filename,
    );
    fs.writeFileSync(createInstantAppPath, content);
    console.log(
      `  ✅ Generated: ${filename} in ${BASE_CREATE_INSTANT_APP_PATH}`,
    );
  }

  console.log('Successfully generated all LLM rule files');
}

async function main() {
  try {
    console.log('Starting LLM rules generator...');
    await generateLLMRuleFiles();
  } catch (error) {
    console.error('Failed to generate LLM rule files:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error in main function:', error);
    process.exit(1);
  });
}
