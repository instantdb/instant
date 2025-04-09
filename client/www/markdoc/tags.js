import { Callout } from '@/components/docs/Callout';
import { Ansi } from '@/components/docs/Ansi';
import {
  NavDefault,
  NavGroup,
  NavButton,
  ConditionalContent,
} from '@/components/docs/NavButton';

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
};

export default tags;
