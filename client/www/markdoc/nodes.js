import { Fence } from '@/components/docs/Fence';
import { Heading } from '@/components/docs/Heading';
import { DocsWrapper } from '@/components/docs/DocsWrapper';
import Markdoc from '@markdoc/markdoc';
import yaml from 'js-yaml';
import { slugifyWithCounter } from '@sindresorhus/slugify';

const { Tag } = Markdoc;

function getNodeText(node) {
  let text = '';
  for (let child of node.children ?? []) {
    if (typeof child === 'string') {
      text += child;
    }
    text += getNodeText(child);
  }
  return text;
}

function collectHeadings(nodes, slugify = slugifyWithCounter()) {
  let sections = [];

  for (let node of nodes) {
    const isH2 =
      node.name === 'h2' ||
      (node.name === 'Heading' && node.attributes?.level === 2);
    const isH3 =
      node.name === 'h3' ||
      (node.name === 'Heading' && node.attributes?.level === 3);

    if (isH2 || isH3) {
      let title = getNodeText(node);
      if (title) {
        let id = slugify(title);
        node.attributes.id = id;
        if (isH3) {
          if (!sections[sections.length - 1]) {
            throw new Error(
              'Cannot add `h3` to table of contents without a preceding `h2`',
            );
          }
          sections[sections.length - 1].children.push({
            ...node.attributes,
            title,
          });
        } else {
          sections.push({ ...node.attributes, title, children: [] });
        }
      }
    }

    // Don't render headings for conditional content
    if (node.name === 'Conditional') {
      continue;
    }

    sections.push(...collectHeadings(node.children ?? [], slugify));
  }

  return sections;
}

const nodes = {
  document: {
    render: DocsWrapper,
    transform(node, config) {
      const frontmatter = node.attributes.frontmatter
        ? yaml.load(node.attributes.frontmatter)
        : {};
      const children = node.transformChildren(config);
      const tableOfContents = collectHeadings(children);
      return new Tag(this.render, { frontmatter, tableOfContents }, children);
    },
  },
  th: {
    attributes: {
      scope: {
        type: String,
        default: 'col',
      },
    },
    render: (props) => <th {...props} />,
  },
  fence: {
    render: Fence,
    attributes: {
      language: {
        type: String,
      },
      lineHighlight: {
        type: String,
      },
      showCopy: {
        type: Boolean,
      },
    },
  },
  heading: {
    render: Heading,
    attributes: {
      id: { type: String },
      level: { type: Number, required: true },
    },
  },
};

export default nodes;
