import { Fence } from '@/components/docs/Fence';
import { Heading } from '@/components/docs/Heading';
import { DocsWrapper } from '@/components/docs/DocsWrapper';
import Markdoc from '@markdoc/markdoc';
import yaml from 'js-yaml';

const { Tag } = Markdoc;

const nodes = {
  document: {
    render: DocsWrapper,
    transform(node, config) {
      const frontmatter = node.attributes.frontmatter
        ? yaml.load(node.attributes.frontmatter)
        : {};
      return new Tag(
        this.render,
        { frontmatter },
        node.transformChildren(config),
      );
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
