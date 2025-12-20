import * as acorn from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import {
  diffSchemas,
  renderAttrCall,
  renderAttrProperty,
  renderEntityProperty,
  renderLinkProperty,
  renderLinkValue,
  type MigrationTx,
} from '@instantdb/platform';
import type { DataAttrDef, InstantSchemaDef } from '@instantdb/core';

const parser = (acorn.Parser as any).extend(tsPlugin({ dts: false }) as any);
const DEFAULT_INDENT = '  ';

export async function updateSchemaFile(
  existingFileContent: string,
  localSchema: InstantSchemaDef<any, any, any>,
  serverSchema: InstantSchemaDef<any, any, any>,
): Promise<string> {
  const ast = parseFile(existingFileContent);
  const schemaObj = findSchemaObject(ast);
  if (!schemaObj) {
    throw new Error('Could not find i.schema(...) in schema file.');
  }

  const { entitiesObj, linksObj } = getSchemaSections(schemaObj);
  const diff = await diffSchemas(
    localSchema,
    serverSchema,
    async (created) => created,
    {},
  );
  if (diff.length === 0) {
    return existingFileContent;
  }

  const { entitiesByName } = buildEntitiesIndex(entitiesObj);

  const { localLinksByForward, serverLinksByForward } = buildLinkMaps(
    localSchema.links || {},
    serverSchema.links || {},
  );
  const changeBuckets = collectChanges(
    diff,
    localLinksByForward,
    serverLinksByForward,
  );

  const edits: Edit[] = [];
  edits.push(
    ...collectEntityEdits(
      existingFileContent,
      entitiesObj,
      entitiesByName,
      changeBuckets,
      serverSchema,
    ),
  );
  edits.push(
    ...collectLinkEdits(
      existingFileContent,
      linksObj,
      changeBuckets,
      localLinksByForward,
      serverLinksByForward,
    ),
  );

  return applyEdits(existingFileContent, edits);
}

type ObjectExpression = {
  type: 'ObjectExpression';
  start: number;
  end: number;
  properties: any[];
};

type PropertyNode = {
  type: 'Property';
  start: number;
  end: number;
  key: any;
  value: any;
};

type EntityInfo = {
  prop: PropertyNode;
  attrsObj: ObjectExpression;
  attrsByName: Map<string, PropertyNode>;
};

type Edit = { start: number; end: number; text: string };

type ChangeBuckets = {
  createEntities: Set<string>;
  deleteEntities: Set<string>;
  addAttrs: Map<string, Set<string>>;
  deleteAttrs: Map<string, Set<string>>;
  updateAttrs: Map<string, Set<string>>;
  addLinks: Set<string>;
  deleteLinks: Set<string>;
  updateLinks: Set<string>;
};

type LinkMap = Map<string, { name: string; link: any }>;

function parseFile(content: string) {
  return parser.parse(content, {
    sourceType: 'module',
    ecmaVersion: 'latest',
  });
}

function getSchemaSections(schemaObj: ObjectExpression) {
  const entitiesProp = findObjectProperty(schemaObj, 'entities');
  if (!entitiesProp || !isObjectExpression(entitiesProp.value)) {
    throw new Error('Could not find entities object in schema file.');
  }
  const linksProp = findObjectProperty(schemaObj, 'links');
  if (!linksProp || !isObjectExpression(linksProp.value)) {
    throw new Error('Could not find links object in schema file.');
  }

  return {
    entitiesObj: entitiesProp.value,
    linksObj: linksProp.value,
  };
}

function buildEntitiesIndex(entitiesObj: ObjectExpression) {
  const entitiesByName = new Map<string, EntityInfo>();

  for (const prop of entitiesObj.properties) {
    if (!isProperty(prop)) continue;
    const name = getPropName(prop);
    if (!name) continue;
    const attrsObj = getEntityAttrsObject(prop.value);
    if (!attrsObj) continue;

    const attrsByName = new Map<string, PropertyNode>();
    for (const attrProp of attrsObj.properties) {
      if (!isProperty(attrProp)) continue;
      const attrName = getPropName(attrProp);
      if (!attrName) continue;
      attrsByName.set(attrName, attrProp);
    }

    entitiesByName.set(name, { prop, attrsObj, attrsByName });
  }

  return { entitiesByName };
}

function buildLinkMaps(
  localLinks: Record<string, any>,
  serverLinks: Record<string, any>,
) {
  return {
    localLinksByForward: buildLinkForwardMap(localLinks),
    serverLinksByForward: buildLinkForwardMap(serverLinks),
  };
}

function collectEntityEdits(
  content: string,
  entitiesObj: ObjectExpression,
  entitiesByName: Map<string, EntityInfo>,
  changeBuckets: ChangeBuckets,
  serverSchema: InstantSchemaDef<any, any, any>,
): Edit[] {
  const edits: Edit[] = [];

  for (const entityName of changeBuckets.deleteEntities) {
    const entity = entitiesByName.get(entityName);
    if (!entity) continue;
    edits.push(removeProperty(content, entitiesObj, entity.prop));
  }

  for (const entityName of changeBuckets.createEntities) {
    if (entitiesByName.has(entityName)) continue;
    const entityDef = serverSchema.entities?.[entityName];
    if (!entityDef) continue;
    const propText = renderEntityProperty(entityName, entityDef.attrs);
    const indent = getObjectPropIndent(content, entitiesObj);
    edits.push(insertProperty(content, entitiesObj, propText, indent));
  }

  for (const [entityName, attrs] of changeBuckets.deleteAttrs) {
    const entity = entitiesByName.get(entityName);
    if (!entity) continue;
    for (const attrName of attrs) {
      const attrProp = entity.attrsByName.get(attrName);
      if (!attrProp) continue;
      edits.push(removeProperty(content, entity.attrsObj, attrProp));
    }
  }

  for (const [entityName, attrs] of changeBuckets.addAttrs) {
    const entity = entitiesByName.get(entityName);
    if (!entity) continue;
    const entityDef = serverSchema.entities?.[entityName];
    if (!entityDef) continue;
    const indent = getObjectPropIndent(content, entity.attrsObj);
    for (const attrName of attrs) {
      const attrDef = entityDef.attrs?.[attrName];
      if (!attrDef) continue;
      const propText = renderAttrProperty(attrName, attrDef);
      edits.push(insertProperty(content, entity.attrsObj, propText, indent));
    }
  }

  for (const [entityName, attrs] of changeBuckets.updateAttrs) {
    const entity = entitiesByName.get(entityName);
    if (!entity) continue;
    const entityDef = serverSchema.entities?.[entityName];
    if (!entityDef) continue;
    for (const attrName of attrs) {
      const attrProp = entity.attrsByName.get(attrName);
      const attrDef = entityDef.attrs?.[attrName];
      if (!attrProp || !attrDef) continue;
      edits.push(updateAttrEdit(content, attrProp, attrDef));
    }
  }

  return edits;
}

function collectLinkEdits(
  content: string,
  linksObj: ObjectExpression,
  changeBuckets: ChangeBuckets,
  localLinksByForward: LinkMap,
  serverLinksByForward: LinkMap,
): Edit[] {
  const edits: Edit[] = [];

  for (const forwardKey of changeBuckets.deleteLinks) {
    const localLink = localLinksByForward.get(forwardKey);
    if (!localLink) continue;
    const linkProp = findObjectProperty(linksObj, localLink.name);
    if (!linkProp) continue;
    edits.push(removeProperty(content, linksObj, linkProp));
  }

  for (const forwardKey of changeBuckets.addLinks) {
    const serverLink = serverLinksByForward.get(forwardKey);
    if (!serverLink) continue;
    const linkName = serverLink.name;
    if (findObjectProperty(linksObj, linkName)) continue;
    const propText = renderLinkProperty(linkName, serverLink.link);
    const indent = getObjectPropIndent(content, linksObj);
    edits.push(insertProperty(content, linksObj, propText, indent));
  }

  for (const forwardKey of changeBuckets.updateLinks) {
    const serverLink = serverLinksByForward.get(forwardKey);
    const localLink = localLinksByForward.get(forwardKey);
    if (!serverLink || !localLink) continue;
    const linkProp = findObjectProperty(linksObj, localLink.name);
    if (!linkProp) continue;
    const nextValue = renderLinkValue(serverLink.link);
    edits.push({
      start: linkProp.value.start,
      end: linkProp.value.end,
      text: nextValue,
    });
  }

  return edits;
}

function updateAttrEdit(
  content: string,
  attrProp: PropertyNode,
  attrDef: DataAttrDef<string, boolean, boolean>,
): Edit {
  const { typeParams } = analyzeChain(attrProp.value);
  const typeParamsText = typeParams
    ? content.slice(typeParams.start, typeParams.end)
    : null;
  const nextValue = renderAttrCall(attrDef, typeParamsText);
  return {
    start: attrProp.value.start,
    end: attrProp.value.end,
    text: nextValue,
  };
}

function applyEdits(content: string, edits: Edit[]) {
  if (edits.length === 0) {
    return content;
  }
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let output = content;
  for (const edit of sorted) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
}

function collectChanges(
  steps: MigrationTx[],
  localLinksByForward: LinkMap,
  serverLinksByForward: LinkMap,
): ChangeBuckets {
  const buckets: ChangeBuckets = {
    createEntities: new Set(),
    deleteEntities: new Set(),
    addAttrs: new Map(),
    deleteAttrs: new Map(),
    updateAttrs: new Map(),
    addLinks: new Set(),
    deleteLinks: new Set(),
    updateLinks: new Set(),
  };

  for (const step of steps) {
    const namespace = step.identifier.namespace;
    const attrName = step.identifier.attrName;
    const forwardKey = `${namespace}.${attrName}`;

    switch (step.type) {
      case 'add-attr': {
        if (attrName === 'id') {
          buckets.createEntities.add(namespace);
          break;
        }
        if (step['value-type'] === 'ref') {
          buckets.addLinks.add(forwardKey);
          break;
        }
        ensureSet(buckets.addAttrs, namespace).add(attrName);
        break;
      }
      case 'delete-attr': {
        if (attrName === 'id') {
          buckets.deleteEntities.add(namespace);
          break;
        }
        if (localLinksByForward.has(forwardKey)) {
          buckets.deleteLinks.add(forwardKey);
          break;
        }
        ensureSet(buckets.deleteAttrs, namespace).add(attrName);
        break;
      }
      case 'update-attr': {
        if (step.partialAttr?.['value-type'] === 'ref') {
          buckets.updateLinks.add(forwardKey);
          break;
        }
        ensureSet(buckets.updateAttrs, namespace).add(attrName);
        break;
      }
      case 'index':
      case 'remove-index':
      case 'unique':
      case 'remove-unique':
      case 'required':
      case 'remove-required':
      case 'check-data-type':
      case 'remove-data-type': {
        if (serverLinksByForward.has(forwardKey)) {
          buckets.updateLinks.add(forwardKey);
          break;
        }
        ensureSet(buckets.updateAttrs, namespace).add(attrName);
        break;
      }
      default: {
        assertNever(step);
      }
    }
  }

  pruneNamespaceBuckets(buckets);
  return buckets;
}

function ensureSet(map: Map<string, Set<string>>, key: string) {
  if (!map.has(key)) map.set(key, new Set());
  return map.get(key)!;
}

function pruneNamespaceBuckets(buckets: ChangeBuckets) {
  const namespaces = new Set<string>([
    ...buckets.createEntities,
    ...buckets.deleteEntities,
  ]);

  for (const namespace of namespaces) {
    buckets.addAttrs.delete(namespace);
    buckets.deleteAttrs.delete(namespace);
    buckets.updateAttrs.delete(namespace);
    removeNamespaceLinks(buckets.addLinks, namespace);
    removeNamespaceLinks(buckets.deleteLinks, namespace);
    removeNamespaceLinks(buckets.updateLinks, namespace);
  }
}

function removeNamespaceLinks(set: Set<string>, namespace: string) {
  const prefix = `${namespace}.`;
  for (const key of Array.from(set)) {
    if (key.startsWith(prefix)) {
      set.delete(key);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled migration step: ${JSON.stringify(value)}`);
}

function analyzeChain(node: any): { typeParams: acorn.Node | null } {
  let curr = node;
  let typeParams: acorn.Node | null = null;

  while (curr?.type === 'CallExpression') {
    if (curr.typeParameters) {
      typeParams = curr.typeParameters;
    }
    if (curr.callee?.type === 'MemberExpression') {
      curr = curr.callee.object;
    } else {
      break;
    }
  }
  return { typeParams };
}

function findSchemaObject(ast: any): ObjectExpression | null {
  let schemaObj: ObjectExpression | null = null;
  const walk = (node: any) => {
    if (!node || schemaObj) return;
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.object?.type === 'Identifier' &&
      node.callee.object.name === 'i' &&
      node.callee.property?.name === 'schema' &&
      node.arguments?.length > 0
    ) {
      const arg = node.arguments[0];
      if (isObjectExpression(arg)) {
        schemaObj = arg;
      }
      return;
    }
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (!value || typeof value !== 'object') continue;
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else {
        walk(value);
      }
    }
  };
  walk(ast);
  return schemaObj;
}

function findObjectProperty(
  obj: ObjectExpression,
  name: string,
): PropertyNode | null {
  for (const prop of obj.properties) {
    if (!isProperty(prop)) continue;
    const propName = getPropName(prop);
    if (propName === name) return prop;
  }
  return null;
}

function getEntityAttrsObject(value: any): ObjectExpression | null {
  if (
    value?.type !== 'CallExpression' ||
    value.callee?.type !== 'MemberExpression' ||
    value.callee.object?.type !== 'Identifier' ||
    value.callee.object.name !== 'i' ||
    value.callee.property?.name !== 'entity'
  ) {
    return null;
  }
  const attrsObj = value.arguments?.[0];
  return isObjectExpression(attrsObj) ? attrsObj : null;
}

function buildLinkForwardMap(links: Record<string, any>) {
  const map = new Map<string, { name: string; link: any }>();
  for (const [name, link] of Object.entries(links || {})) {
    map.set(linkForwardKey(link), { name, link });
  }
  return map;
}

function linkForwardKey(link: any) {
  return `${link.forward.on}.${link.forward.label}`;
}

function isObjectExpression(node: any): node is ObjectExpression {
  return node?.type === 'ObjectExpression';
}

function isProperty(node: any): node is PropertyNode {
  return node?.type === 'Property';
}

function getPropName(prop: PropertyNode) {
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal') return String(prop.key.value);
  return null;
}

function indentLines(text: string, indent: string) {
  return text
    .split('\n')
    .map((line) => (line.length ? indent + line : line))
    .join('\n');
}

function getObjectPropIndent(source: string, obj: ObjectExpression) {
  const props = obj.properties.filter(isProperty);
  if (props.length > 0) {
    return getLineIndent(source, props[0].start);
  }
  const closingIndent = getLineIndent(source, obj.end - 1);
  return closingIndent + DEFAULT_INDENT;
}

function getLineIndent(source: string, pos: number) {
  const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
  const match = source.slice(lineStart, pos).match(/^[\t ]*/);
  return match ? match[0] : '';
}

function insertProperty(
  source: string,
  obj: ObjectExpression,
  propText: string,
  indent: string,
) {
  const props = obj.properties.filter(isProperty);
  const closingBrace = obj.end - 1;
  const propTextWithIndent = indentLines(propText, indent);

  if (props.length === 0) {
    const objSource = source.slice(obj.start, obj.end);
    const multiline = objSource.includes('\n') || propText.includes('\n');
    if (!multiline) {
      return {
        start: closingBrace,
        end: closingBrace,
        text: ` ${propTextWithIndent} `,
      };
    }
    const closingIndent = getLineIndent(source, closingBrace);
    return {
      start: closingBrace,
      end: closingBrace,
      text: `\n${propTextWithIndent},\n${closingIndent}`,
    };
  }

  const lastProp = props[props.length - 1];
  const multiline = source.slice(lastProp.end, closingBrace).includes('\n');
  const needsComma = !hasTrailingComma(source, lastProp.end, obj.end);

  if (!multiline) {
    const insertPos = closingBrace;
    return {
      start: insertPos,
      end: insertPos,
      text: `${needsComma ? ',' : ''} ${propTextWithIndent}`,
    };
  }

  const lineStart = source.lastIndexOf('\n', closingBrace);
  return {
    start: lineStart,
    end: lineStart,
    text: `${needsComma ? ',' : ''}\n${propTextWithIndent},`,
  };
}

function removeProperty(
  source: string,
  obj: ObjectExpression,
  prop: PropertyNode,
) {
  let start = prop.start;
  let end = prop.end;
  const after = skipWhitespaceAndComments(source, end, obj.end);
  if (source[after] === ',') {
    end = after + 1;
  } else {
    const before = skipWhitespaceAndCommentsBackward(source, start, obj.start);
    if (source[before] === ',') {
      start = before;
    }
  }
  return { start, end, text: '' };
}

function hasTrailingComma(source: string, afterPos: number, endPos: number) {
  const next = skipWhitespaceAndComments(source, afterPos, endPos);
  return source[next] === ',';
}

function skipWhitespaceAndComments(
  source: string,
  start: number,
  end: number,
) {
  let i = start;
  while (i < end) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      const nextLine = source.indexOf('\n', i + 2);
      i = nextLine === -1 ? end : nextLine + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close === -1 ? end : close + 2;
      continue;
    }
    break;
  }
  return i;
}

function skipWhitespaceAndCommentsBackward(
  source: string,
  start: number,
  end: number,
) {
  let i = start - 1;
  while (i >= end) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i -= 1;
      continue;
    }
    if (ch === '/' && source[i - 1] === '/') {
      const prevLine = source.lastIndexOf('\n', i - 2);
      i = prevLine === -1 ? end - 1 : prevLine - 1;
      continue;
    }
    if (ch === '/' && source[i - 1] === '*') {
      const open = source.lastIndexOf('/*', i - 2);
      i = open === -1 ? end - 1 : open - 1;
      continue;
    }
    break;
  }
  return i;
}
