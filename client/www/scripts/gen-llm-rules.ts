/**
 * Script for generating LLM rule files.
 *
 * Reads instant-rules.md and writes it to the docs site and the
 * create-instant-app template.
 *
 * Usage: pnpm exec tsx scripts/gen-llm-rules.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE_PATH = path.join(__dirname, '../lib/intern/instant-rules.md');
const TARGETS = [
  path.join(__dirname, '../public/llm-rules/AGENTS.md'),
  path.join(
    __dirname,
    '../../packages/create-instant-app/template/rules/AGENTS.md',
  ),
];

function generateLLMRuleFiles() {
  console.log('Reading base rules file...');

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template file not found: ${TEMPLATE_PATH}`);
  }

  const content = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  if (!content.trim()) {
    throw new Error('Template file is empty');
  }

  console.log('Generating LLM rule files...');
  for (const target of TARGETS) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    console.log(`  ✅ Generated: ${target}`);
  }

  console.log('Successfully generated all LLM rule files');
}

try {
  console.log('Starting LLM rules generator...');
  generateLLMRuleFiles();
} catch (error) {
  console.error('Failed to generate LLM rule files:', error);
  process.exit(1);
}
