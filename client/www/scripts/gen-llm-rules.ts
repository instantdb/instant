/**
 * Script for generating LLM rule files for different platforms (next, expo,
 * etc.)
 *
 * Output files are saved to public/llm-rules/[platform]/
 *
 * Usage: pnpm exec tsx scripts/gen-llm-rules.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Sections {
  CURSOR_FRONTMATTER: string;
  WINDSURF_FRONTMATTER: string;
  INTRO: string;
  INSTANT_RULES: string;
  BASICS: string;
  APP_DESCRIPTION: string;
  APP_CODE: string;
  DOCUMENTATION: string;
}

function parseTemplate(templatePath: string): Sections {
  const content = fs.readFileSync(templatePath, 'utf-8');
  const sections: Sections = {
    CURSOR_FRONTMATTER: '',
    WINDSURF_FRONTMATTER: '',
    INTRO: '',
    INSTANT_RULES: '',
    BASICS: '',
    APP_DESCRIPTION: '',
    APP_CODE: '',
    DOCUMENTATION: '',
  };

  // Split by section markers
  const sectionRegex =
    /<!-- SECTION: (\w+) -->\s*\n([\s\S]*?)(?=<!-- SECTION:|$)/g;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1] as keyof Sections;
    const sectionContent = match[2].trim();

    if (sectionName === 'APP_CODE') {
      sections[sectionName] = buildAppCode();
    } else {
      sections[sectionName] = sectionContent;
    }
  }

  return sections;
}

// The APP_CODE section is generated from the TypeScript source files in
// lib/intern/llm-example/
function buildAppCode(): string {
  console.log('Building app code from source files...');

  const exampleDir = path.join(__dirname, '../lib/intern/llm-example');

  // Read all source files
  const dbFile = fs.readFileSync(path.join(exampleDir, 'lib/db.ts'), 'utf-8');
  const schemaFile = fs.readFileSync(
    path.join(exampleDir, 'instant.schema.ts'),
    'utf-8',
  );
  const pageFile = fs.readFileSync(
    path.join(exampleDir, 'app/page.tsx'),
    'utf-8',
  );

  // Fix the APP_ID line in db.ts
  const dbFileFixed = dbFile.replace(
    'process.env.NEXT_PUBLIC_LLM_EXAMPLE_APP_ID!',
    'process.env.NEXT_PUBLIC_INSTANT_APP_ID!',
  );

  return `\`\`\`typescript
/* FILE: lib/db.ts */
${dbFileFixed}
/* FILE: instant.schema.ts */
${schemaFile}
/* FILE: app/page.tsx */
${pageFile}\`\`\``;
}

function buildClaudeMd(sections: Sections): string {
  return [sections.INTRO, sections.INSTANT_RULES].join('\n\n');
}

function buildClaudeRules(sections: Sections): string {
  return [
    sections.BASICS,
    sections.APP_DESCRIPTION,
    sections.APP_CODE,
    sections.DOCUMENTATION,
  ].filter(x => x != '').join('\n\n');
}

function buildCursorRules(sections: Sections): string {
  return [
    sections.CURSOR_FRONTMATTER,
    sections.INTRO,
    sections.BASICS,
    sections.APP_DESCRIPTION,
    sections.APP_CODE,
    sections.DOCUMENTATION,
  ].filter(x => x != '').join('\n\n');
}

function buildWindsurfRules(sections: Sections): string {
  return [
    sections.WINDSURF_FRONTMATTER,
    sections.INTRO,
    sections.BASICS,
    sections.APP_DESCRIPTION,
    sections.APP_CODE,
    sections.DOCUMENTATION,
  ].filter(x => x != '').join('\n\n');
}

function buildOtherRules(sections: Sections): string {
  return [
    sections.INTRO,
    sections.BASICS,
    sections.APP_DESCRIPTION,
    sections.APP_CODE,
    sections.DOCUMENTATION,
  ].filter(x => x != '').join('\n\n');
}

type Platform = 'next' | 'expo';

const BASE_PUBLIC_RULES_PATH = path.join(
  __dirname,
  '../public/llm-rules',
);
const BASE_CREATE_INSTANT_APP_PATH = path.join(
  __dirname,
  '../../packages/create-instant-app/template/rules',
);

const platformConfig = {
  'next': {
    templatePath: path.join(
      __dirname,
      '../lib/intern/llm-example/llm-rules-template.md',
    ),
    outputDir: path.join(BASE_PUBLIC_RULES_PATH, 'next'),
    createInstantAppOutputDir: path.join(
      BASE_CREATE_INSTANT_APP_PATH,
      'next',
    ),
  },
  'expo': {
    templatePath: path.join(
      __dirname,
      '../lib/intern/expo-llm-example/expo-rules-template.md',
    ),
    outputDir: path.join(BASE_PUBLIC_RULES_PATH, 'expo'),
    createInstantAppOutputDir: path.join(
      BASE_CREATE_INSTANT_APP_PATH,
      'expo',
    ),
  },
}

async function generateLLMRuleFiles(platform: Platform) {
  const { templatePath, outputDir, createInstantAppOutputDir } = platformConfig[platform];
  console.log(`Parsing template file for ${platform}...`);
  const sections = parseTemplate(templatePath);

  const files = [
    { filename: 'claude.md', build: () => buildClaudeMd(sections) },
    { filename: 'claude-rules.md', build: () => buildClaudeRules(sections) },
    { filename: 'cursor-rules.md', build: () => buildCursorRules(sections) },
    {
      filename: 'windsurf-rules.md',
      build: () => buildWindsurfRules(sections),
    },
    { filename: 'other-rules.md', build: () => buildOtherRules(sections) },
  ];

  // Ensure output directories exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (!fs.existsSync(createInstantAppOutputDir)) {
    fs.mkdirSync(createInstantAppOutputDir, { recursive: true });
  }

  // Generate all files
  console.log('Generating LLM rule files...');
  for (const { filename, build } of files) {
    const content = build();
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, content);
    console.log(`  ✅ Generated: ${filename} in ${outputDir}`);

    const createInstantAppOutputPath = path.join(createInstantAppOutputDir, filename);
    fs.writeFileSync(createInstantAppOutputPath, content);
    console.log(`  ✅ Generated: ${filename} in ${createInstantAppOutputDir}`);
  }

  console.log(
    `Successfully generated LLM rule files for ${platform}`,
  );
}

async function main() {
  try {
    console.log('Starting LLM rules generator...');
    await generateLLMRuleFiles('next');
    await generateLLMRuleFiles('expo');
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
