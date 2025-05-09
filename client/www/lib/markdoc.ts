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

// Remove `{% ... %}` tags from markdown content
function sanitizeMarkdown(content: string): string {
  return content.replace(/{%[\s\S]*?%}/g, '');
}

// Transform markdoc content into a markdown format that's sanitized for
// llms
function transformContent(content: string): string {
  const { frontmatter, content: markdownContent } = parseFrontmatter(content);
  let result = '';

  if (frontmatter.title) {
    result += `# ${frontmatter.title}\n\n`;
  }

  if (frontmatter.description) {
    result += `${frontmatter.description}\n\n`;
  }

  const sanitizedContent = sanitizeMarkdown(markdownContent);
  return result + sanitizedContent;
}

export { parseFrontmatter, transformContent };
