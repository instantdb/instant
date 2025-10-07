import { Callout } from '@/components/docs/Callout';
import { Ansi } from '@/components/docs/Ansi';
import {
  NavDefault,
  NavGroup,
  NavButton,
  ConditionalContent,
} from '@/components/docs/NavButton';
import { Tag, transformer } from '@markdoc/markdoc';
import { HasAppID } from '../components/docs/Fence';
import { TabbedSingle } from '../components/docs/TabbedSingle';
import { CopyPromptBox } from '../components/docs/CopyPromptBox';

function CustomDiv({ className, children }) {
  return <div className={className}>{children}</div>;
}

const tags = {
  div: {
    render: CustomDiv,
    attributes: {
      className: { type: String },
    },
  },
  callout: {
    attributes: {
      title: { type: String },
      type: {
        type: String,
        default: 'note',
        matches: ['info', 'note', 'warning'],
        errorLevel: 'critical',
      },
    },
    render: Callout,
  },
  ansi: {
    attributes: {
      content: { type: String },
    },
    render: Ansi,
  },
  screenshot: {
    selfClosing: true,
    attributes: {
      src: { type: String },
    },
    render: ({ src }) => (
      <img src={src} className="rounded-md border p-4 shadow-md" />
    ),
  },
  figure: {
    selfClosing: true,
    attributes: {
      src: { type: String },
      alt: { type: String },
      caption: { type: String },
    },
    render: ({ src, alt = '', caption }) => (
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} />
        <figcaption>{caption}</figcaption>
      </figure>
    ),
  },
  'nav-default': {
    render: NavDefault,
    attributes: {
      value: { type: String },
    },
  },
  'nav-group': {
    render: NavGroup,
  },
  'nav-button': {
    selfClosing: true,
    render: NavButton,
    attributes: {
      href: { type: String },
      title: { type: String },
      description: { type: String },
      param: { type: String },
      value: { type: String },
      recommended: { type: Boolean },
    },
  },
  conditional: {
    render: ConditionalContent,
    attributes: {
      param: { type: String, required: true },
      value: { type: [String, Array], required: true },
    },
    transform(node, config) {
      // Supports an else tag inside of the conditional.
      const attrs = node.transformAttributes(config);
      const kids = node.children ?? [];

      const idx = kids.findIndex((c) => c?.type === 'tag' && c?.tag === 'else');

      const thenNodes = idx === -1 ? kids : kids.slice(0, idx);
      const elseNodes = idx === -1 ? [] : kids.slice(idx);

      const thenChildren = thenNodes.map((c) => transformer.node(c, config));
      const elseChildren = elseNodes.map((c) => transformer.node(c, config));

      return new Tag(this.render, { ...attrs, elseChildren }, thenChildren);
    },
  },

  'has-app-id': {
    render: HasAppID,
    transform(node, config) {
      const attrs = node.transformAttributes(config);
      const kids = node.children ?? [];
      const idx = kids.findIndex((c) => c?.type === 'tag' && c?.tag === 'else');

      const thenNodes = idx === -1 ? kids : kids.slice(0, idx);
      const elseNodes = idx === -1 ? [] : kids.slice(idx);

      const thenChildren = thenNodes.map((c) => transformer.node(c, config));
      const elseChildren = elseNodes.map((c) => transformer.node(c, config));

      return new Tag(this.render, { ...attrs, elseChildren }, thenChildren);
    },
  },

  'blank-link': {
    selfClosing: true,
    attributes: {
      href: { type: String },
      label: { type: String },
    },
    render: ({ href, label }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    ),
  },

  'tabbed-single': {
    render: TabbedSingle,
    attributes: {
      tabs: { type: Object, required: true },
      defaultTab: { type: String },
      storageKey: { type: String, required: true },
    },
  },

  'copy-prompt-box': {
    render: CopyPromptBox,
    attributes: {
      id: { type: String },
      description: { type: String },
    },
  },
};

export default tags;
