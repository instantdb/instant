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

// Extract attributes from a nav-button tag and convert to a markdown
// list item. Href-based buttons become `- [title](href): description`,
// param/value buttons become `- **title**: description`
function navButtonToMarkdown(tag: string): string | null {
  const href = tag.match(/href="([^"]*)"/)?.[1];
  const title = tag.match(/title="([^"]*)"/)?.[1];
  const desc = tag.match(/description="([^"]*)"/)?.[1];
  if (!title) return null;
  if (href) {
    return desc ? `- [${title}](${href}): ${desc}` : `- [${title}](${href})`;
  }
  return desc ? `- **${title}**: ${desc}` : `- **${title}**`;
}

// Remove `{% ... %}` tags from markdown content, converting known tags
// like nav-button into plain markdown equivalents
function sanitizeMarkdown(content: string): string {
  return content.replace(/{%[\s\S]*?%}/g, (match) => {
    if (/nav-button\s/.test(match)) {
      return navButtonToMarkdown(match) ?? '';
    }
    return '';
  });
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
