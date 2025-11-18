import fs from 'fs';
import { appMetas, AppMetadata } from './data';

// Content is written in markdown files and additional metadata is stored in
// in a ts file for more expressive fields (longer descriptions, tags, etc).
export interface ExampleApp extends AppMetadata {
  content: string;
}

export function getExampleAppBySlug(slug: string): ExampleApp {
  const content = fs.readFileSync(`./_examples/${slug}.md`, 'utf-8');
  const meta = appMetas.find((app) => app.slug === slug);
  if (!meta) {
    throw new Error(
      `This should not happen. App with slug "${slug}" not found.`,
    );
  }
  return { ...meta, content };
}

function removeMdExtension(str: string): string {
  return str.replace(/\.md$/, '');
}

export function getAllSlugs(): string[] {
  const dir = fs.readdirSync('./_examples');
  return dir.map((mdName) => removeMdExtension(mdName));
}

export function getAllExamples(): ExampleApp[] {
  return getAllSlugs().map((slug) => getExampleAppBySlug(slug));
}
