import type { AttrsDefs, DataAttrDef, LinkDef, LinksDef } from '@instantdb/core';
import { indentLines, joinWithTrailingSep, sortedEntries } from './util.ts';

const DEFAULT_INDENT = 2;

type AnyLink = LinkDef<any, any, any, any, any, any, any>;

type KeyFormatOptions = {
  alwaysQuote?: boolean;
  quote?: '"' | "'";
};

type EntityRenderOptions = {
  indent?: number;
  typeParamsByAttr?: Record<string, string | null | undefined>;
  keyOptions?: KeyFormatOptions;
  trailingComma?: boolean;
};

type LinkRenderOptions = {
  indent?: number;
  keyOptions?: KeyFormatOptions;
  stringQuote?: '"' | "'";
  style?: 'js' | 'json';
};

type LinksObjectOptions = {
  indent?: number;
  newlineForEmpty?: boolean;
  keyOptions?: KeyFormatOptions;
  stringQuote?: '"' | "'";
  style?: 'js' | 'json';
};

export function formatKey(name: string, options: KeyFormatOptions = {}) {
  const quote = options.quote ?? "'";
  if (!options.alwaysQuote && isValidIdentifier(name)) {
    return name;
  }
  return `${quote}${name}${quote}`;
}

export function renderAttrCall(
  attr: DataAttrDef<string, boolean, boolean>,
  typeParams?: string | null,
) {
  const type =
    (attr.metadata?.derivedType as any)?.type || attr.valueType || 'any';
  const unique = attr.config.unique ? '.unique()' : '';
  const index = attr.config.indexed ? '.indexed()' : '';
  const required = attr.required ? '' : '.optional()';
  return `i.${type}${typeParams ?? ''}()${unique}${index}${required}`;
}

export function renderAttrProperty(
  name: string,
  attr: DataAttrDef<string, boolean, boolean>,
  options: { typeParams?: string | null; keyOptions?: KeyFormatOptions } = {},
) {
  return `${formatKey(name, options.keyOptions)}: ${renderAttrCall(
    attr,
    options.typeParams,
  )}`;
}

export function renderEntityProperty(
  name: string,
  attrs: AttrsDefs,
  options: EntityRenderOptions = {},
) {
  const indent = options.indent ?? DEFAULT_INDENT;
  const keyOptions = options.keyOptions;
  const attrBlock = sortedEntries(attrs)
    .map(([attrName, attrDef]) =>
      renderAttrProperty(
        attrName,
        attrDef,
        {
          typeParams: options.typeParamsByAttr?.[attrName] ?? null,
          keyOptions,
        },
      ),
    )
    .filter(Boolean);
  const attrBlockText = options.trailingComma
    ? joinWithTrailingSep(attrBlock, ',\n', ',')
    : attrBlock.join(',\n');
  const inner = attrBlockText.length
    ? `\n${indentLines(attrBlockText, indent)}\n`
    : '';
  return `${formatKey(name, keyOptions)}: i.entity({${inner}})`;
}

export function renderLinkValue(
  link: AnyLink,
  options: LinkRenderOptions = {},
) {
  const indent = options.indent ?? DEFAULT_INDENT;
  const indentStr = ' '.repeat(indent);
  const keyOptions = options.keyOptions;
  const q = options.stringQuote ?? "'";
  const style = options.style ?? 'js';
  const forwardLines = [
    `${formatKey('on', keyOptions)}: ${q}${link.forward.on}${q}`,
    `${formatKey('has', keyOptions)}: ${q}${link.forward.has}${q}`,
    `${formatKey('label', keyOptions)}: ${q}${link.forward.label}${q}`,
  ];
  if (link.forward.required) {
    forwardLines.push(`${formatKey('required', keyOptions)}: true`);
  }
  if (link.forward.onDelete) {
    forwardLines.push(
      `${formatKey('onDelete', keyOptions)}: ${q}${link.forward.onDelete}${q}`,
    );
  }

  const reverseLines = [
    `${formatKey('on', keyOptions)}: ${q}${link.reverse.on}${q}`,
    `${formatKey('has', keyOptions)}: ${q}${link.reverse.has}${q}`,
    `${formatKey('label', keyOptions)}: ${q}${link.reverse.label}${q}`,
  ];
  if (link.reverse.onDelete) {
    reverseLines.push(
      `${formatKey('onDelete', keyOptions)}: ${q}${link.reverse.onDelete}${q}`,
    );
  }

  const forwardBodyLines =
    style === 'json'
      ? forwardLines
      : forwardLines.map((line) => `${line},`);
  const reverseBodyLines =
    style === 'json'
      ? reverseLines
      : reverseLines.map((line) => `${line},`);

  return [
    '{',
    `${indentStr}${formatKey('forward', keyOptions)}: {`,
    `${indentStr}${indentStr}${forwardBodyLines.join(
      `${style === 'json' ? ',' : ''}\n${indentStr}${indentStr}`,
    )}`,
    `${indentStr}}${style === 'json' ? ',' : ','}`,
    `${indentStr}${formatKey('reverse', keyOptions)}: {`,
    `${indentStr}${indentStr}${reverseBodyLines.join(
      `${style === 'json' ? ',' : ''}\n${indentStr}${indentStr}`,
    )}`,
    `${indentStr}}${style === 'json' ? '' : ','}`,
    '}',
  ].join('\n');
}

export function renderLinkProperty(
  name: string,
  link: AnyLink,
  options: LinkRenderOptions = {},
) {
  return `${formatKey(name, options.keyOptions)}: ${renderLinkValue(
    link,
    options,
  )}`;
}

export function renderLinksObject(
  links: LinksDef<any>,
  options: LinksObjectOptions = {},
) {
  const indent = options.indent ?? DEFAULT_INDENT;
  const entries = sortedEntries(links).map(([name, link]) =>
    renderLinkProperty(name, link, {
      indent,
      keyOptions: options.keyOptions,
      stringQuote: options.stringQuote,
      style: options.style,
    }),
  );
  if (!entries.length && !options.newlineForEmpty) {
    return '{}';
  }
  const inner = entries.length ? indentLines(entries.join(',\n'), indent) : '';
  return `{\n${inner}\n}`;
}

function isValidIdentifier(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
