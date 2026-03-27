import yaml from 'js-yaml';

// Extract frontmatter from markdoc content and separate it from the
// markdoc content
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

  const frontmatter = yaml.load(frontmatterStr) || {};

  return { frontmatter, content: remainingContent };
}

// Remove `{% ... %}` tags from markdown content
function sanitizeMarkdown(content: string): string {
  return content.replace(/{%[\s\S]*?%}/g, '');
}

// Transform markdoc content into a markdown format that's sanitized for
// llms
function transformContent(content: string): string {
  const { frontmatter, content: markdownContent } = parseFrontmatter(content);
  let result = '';

  const title = frontmatter.nextjs?.metadata?.title;
  const description = frontmatter.nextjs?.metadata?.description;

  if (title) {
    result += `# ${title}\n\n`;
  }

  if (description) {
    result += `${description}\n\n`;
  }

  const sanitizedContent = sanitizeMarkdown(markdownContent);
  return result + sanitizedContent;
}

export { parseFrontmatter, transformContent };
