import type {
  AttrsDefs,
  CardinalityKind,
  EntitiesDef,
  EntityDef,
  InstantDBAttr,
  InstantDBCheckedDataType,
  InstantDBIdent,
  InstantSchemaDef,
  LinkAttrDef,
  LinksDef,
  RoomsDef,
} from '@instantdb/core';

export type InstantAPIPlatformSchema = {
  refs: Record<string, InstantDBAttr>;
  blobs: Record<string, Record<string, InstantDBAttr>>;
};

export type InstantAPISchemaPlanAddAttrStep = {
  type: 'add-attr';
  friendlyDescription: string;
  attr: InstantDBAttr;
};

export type InstantAPISchemaPlanUpdateAttrStep = {
  type: 'update-attr';
  friendlyDescription: string;
  attr: InstantDBAttr;
};

export type InstantAPISchemaPlanIndexStep = {
  type: 'index';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
};

export type InstantAPISchemaPlanRemoveIndexStep = {
  type: 'remove-index';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
};

export type InstantAPISchemaPlanUniqueStep = {
  type: 'unique';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
};

export type InstantAPISchemaPlanRemoveUniqueStep = {
  type: 'remove-unique';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
};

export type InstantAPISchemaPlanRequiredStep = {
  type: 'required';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
};

export type InstantAPISchemaPlanRemoveRequiredStep = {
  type: 'remove-required';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
};

export type InstantAPISchemaPlanCheckDataTypeStep = {
  type: 'check-data-type';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
  checkedDataType: InstantDBCheckedDataType;
};

export type InstantAPISchemaPlanRemoveDataTypeStep = {
  type: 'remove-data-type';
  friendlyDescription: string;
  attrId: string;
  forwardIdentity: InstantDBIdent;
};

type InstantBackgroundSchemaBaseJob = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'completed' | 'waiting' | 'processing' | 'errored';
  workEstimate: number | null;
  workCompleted: number | null;
  error?:
    | 'invalid-triple-error'
    | 'invalid-attr-state-error'
    | 'triple-not-unique-error'
    | 'triple-too-large-error'
    | 'missing-required-error'
    | 'unexpected-error';
  invalidTriplesSample?: {
    entityId: string;
    value: any;
    jsonType:
      | 'string'
      | 'number'
      | 'boolean'
      | 'null'
      | 'object'
      | 'array'
      | 'date';
  }[];
};

type InstantBackgroundSchemaBaseJobWithInvalidTriples =
  InstantBackgroundSchemaBaseJob & {
    invalidTriplesSample?: {
      entityId: string;
      value: any;
      jsonType:
        | 'string'
        | 'number'
        | 'boolean'
        | 'null'
        | 'object'
        | 'array'
        | 'date';
    }[];
  };

export interface InstantBackgroundSchemaRemoveDataTypeJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-data-type';
}

export interface InstantBackgroundSchemaCheckDataTypeJob
  extends InstantBackgroundSchemaBaseJobWithInvalidTriples {
  type: 'check-data-type';
  checkedDataType: InstantDBCheckedDataType;
}

export interface InstantBackgroundSchemaAddIndexJob
  extends InstantBackgroundSchemaBaseJobWithInvalidTriples {
  type: 'index';
}

export interface InstantBackgroundSchemaRemoveIndexJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-index';
}

export interface InstantBackgroundSchemaAddUniqueJob
  extends InstantBackgroundSchemaBaseJobWithInvalidTriples {
  type: 'unique';
  invalidUniqueValue?: any;
}

export interface InstantBackgroundSchemaRemoveUniqueJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-unique';
}

export interface InstantBackgroundSchemaAddRequiredJob
  extends InstantBackgroundSchemaBaseJobWithInvalidTriples {
  type: 'required';
}

export interface InstantBackgroundSchemaRemoveRequiredJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-required';
}

export type InstantAPISchemaPlanStep =
  | InstantAPISchemaPlanAddAttrStep
  | InstantAPISchemaPlanUpdateAttrStep
  | InstantAPISchemaPlanIndexStep
  | InstantAPISchemaPlanRemoveIndexStep
  | InstantAPISchemaPlanUniqueStep
  | InstantAPISchemaPlanRemoveUniqueStep
  | InstantAPISchemaPlanRequiredStep
  | InstantAPISchemaPlanRemoveRequiredStep
  | InstantAPISchemaPlanCheckDataTypeStep
  | InstantAPISchemaPlanRemoveDataTypeStep;

type BackgroundJobByStep = {
  index: InstantBackgroundSchemaAddIndexJob;
  'remove-index': InstantBackgroundSchemaRemoveIndexJob;
  unique: InstantBackgroundSchemaAddUniqueJob;
  'remove-unique': InstantBackgroundSchemaRemoveUniqueJob;
  required: InstantBackgroundSchemaAddRequiredJob;
  'remove-required': InstantBackgroundSchemaRemoveRequiredJob;
  'check-data-type': InstantBackgroundSchemaCheckDataTypeJob;
  'remove-data-type': InstantBackgroundSchemaRemoveDataTypeJob;
};

// Adds the proper flavor of the backgroundJob type to the steps
// that run in the background
export type WithBackgroundJob<P extends { type: string }> =
  P['type'] extends keyof BackgroundJobByStep
    ? P & { backgroundJob: BackgroundJobByStep[P['type']] }
    : P;

export type InstantAPISchemaPushAddAttrStep =
  WithBackgroundJob<InstantAPISchemaPlanAddAttrStep>;

export type InstantAPISchemaPushUpdateAttrStep =
  WithBackgroundJob<InstantAPISchemaPlanUpdateAttrStep>;

export type InstantAPISchemaPushIndexStep =
  WithBackgroundJob<InstantAPISchemaPlanIndexStep>;

export type InstantAPISchemaPushRemoveIndexStep =
  WithBackgroundJob<InstantAPISchemaPlanRemoveIndexStep>;

export type InstantAPISchemaPushUniqueStep =
  WithBackgroundJob<InstantAPISchemaPlanUniqueStep>;

export type InstantAPISchemaPushRemoveUniqueStep =
  WithBackgroundJob<InstantAPISchemaPlanRemoveUniqueStep>;

export type InstantAPISchemaPushRequiredStep =
  WithBackgroundJob<InstantAPISchemaPlanRequiredStep>;

export type InstantAPISchemaPushRemoveRequiredStep =
  WithBackgroundJob<InstantAPISchemaPlanRemoveRequiredStep>;

export type InstantAPISchemaPushCheckDataTypeStep =
  WithBackgroundJob<InstantAPISchemaPlanCheckDataTypeStep>;

export type InstantAPISchemaPushRemoveDataTypeStep =
  WithBackgroundJob<InstantAPISchemaPlanRemoveDataTypeStep>;

export type InstantAPISchemaPushStep =
  | InstantAPISchemaPushAddAttrStep
  | InstantAPISchemaPushUpdateAttrStep
  | InstantAPISchemaPushIndexStep
  | InstantAPISchemaPushRemoveIndexStep
  | InstantAPISchemaPushUniqueStep
  | InstantAPISchemaPushRemoveUniqueStep
  | InstantAPISchemaPushRequiredStep
  | InstantAPISchemaPushRemoveRequiredStep
  | InstantAPISchemaPushCheckDataTypeStep
  | InstantAPISchemaPushRemoveDataTypeStep;

function sortedEntries<T>(o: Record<string, T>): [string, T][] {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function indentLines(s: string, n = 2) {
  const space = ' '.repeat(n);
  return s
    .split('\n')
    .map((l) => `${space}${l}`)
    .join('\n');
}

/**
 * Generates code for a single attr:
 *   attr2: i.number.index()
 */
function attrToCodeString([name, config]: [string, InstantDBAttr]) {
  const { type } = deriveClientType(config);
  const unique = config['unique?'] ? '.unique()' : '';
  const index = config['index?'] ? '.indexed()' : '';
  const required = config['required?'] ? '' : '.optional()';
  return `"${name}": i.${type}()${unique}${index}${required}`;
}

/**
 * Generates code for an entity:
 *  i.entity({
 *    attr1: i.string(),
 *    attr2: i.number.index()
 * })
 *
 */
function schemaBlobToCodeStr(
  name: string,
  attrs: InstantAPIPlatformSchema['blobs'][string],
) {
  const attrBlock = sortedEntries(attrs)
    .filter(([name]) => name !== 'id')
    .map((attr) => attrToCodeString(attr))
    .join(',\n');
  return `"${name}": i.entity({
${indentLines(attrBlock, 2)}
})`;
}

/**
 * Note:
 * This is _very_ similar to `schemaBlobToCodeStr`.
 *
 * Right now, the frontend and backend have slightly different data structures for storing entity info.
 *
 * The backend returns {etype: attrs}, where attr keep things like `value-type`
 * The frontend stores {etype: EntityDef}, where EntityDef has a `valueType` field.
 *
 * For now, keeping the two functions separate.
 */
function entityDefToCodeStr(
  name: string,
  edef: EntityDef<
    AttrsDefs,
    Record<string, LinkAttrDef<CardinalityKind, string>>,
    any
  >,
) {
  // a block of code for each entity
  return [
    `  `,
    `"${name}"`,
    `: `,
    `i.entity`,
    `({`,
    `\n`,
    // a line of code for each attribute in the entity
    sortedEntries(edef.attrs)
      .map(([name, attr]) => {
        const type = attr['valueType'] || 'any';

        return [
          `    `,
          `"${name}"`,
          `: `,
          `i.${type}()`,
          attr?.config['unique'] ? '.unique()' : '',
          attr?.config['indexed'] ? '.indexed()' : '',
          `,`,
        ].join('');
      })
      .join('\n'),
    `\n`,
    `  `,
    `})`,
    `,`,
  ].join('');
}

export function identEtype(ident: InstantDBIdent) {
  return ident[1];
}

export function identLabel(ident: InstantDBIdent) {
  return ident[2];
}

export function identName(ident: InstantDBIdent) {
  return `${identEtype(ident)}.${identLabel(ident)}`;
}

export function attrFwdLabel(attr: InstantDBAttr) {
  return attr['forward-identity']?.[2];
}

export function attrFwdEtype(attr: InstantDBAttr) {
  return attr['forward-identity']?.[1];
}

export function attrRevLabel(attr: InstantDBAttr) {
  return attr['reverse-identity']?.[2];
}

export function attrRevEtype(attr: InstantDBAttr) {
  return attr['reverse-identity']?.[1];
}

export function attrFwdName(attr: InstantDBAttr) {
  return `${attrFwdEtype(attr)}.${attrFwdLabel(attr)}`;
}

export function attrRevName(attr: InstantDBAttr) {
  if (attr['reverse-identity']) {
    return `${attrRevEtype(attr)}.${attrRevLabel(attr)}`;
  }
}

function inferredType(attr: InstantDBAttr) {
  if (attr.catalog === 'system') {
    return null;
  }

  const inferredList = attr['inferred-types'];
  const hasJustOne = inferredList?.length === 1;

  if (!hasJustOne) {
    return null;
  }

  return inferredList[0];
}

function deriveClientType(attr: InstantDBAttr) {
  if (attr['checked-data-type']) {
    return { type: attr['checked-data-type'], origin: 'checked' };
  }

  const inferred = inferredType(attr);

  if (inferred) {
    return { type: inferred, origin: 'inferred' };
  }

  return { type: 'any', origin: 'unknown' };
}

function easyPlural(strn: string, n: number) {
  return n === 1 ? strn : strn + 's';
}

const rels = {
  'many-false': ['many', 'many'],
  'one-true': ['one', 'one'],
  'many-true': ['many', 'one'],
  'one-false': ['one', 'many'],
};

function roomDefToCodeStr(room: RoomsDef[string]) {
  let ret = '{';

  if (room.presence) {
    ret += `\n${indentLines(entityDefToCodeStr('presence', room.presence), 2)}`;
  }

  if (room.topics) {
    ret += `\n    topics: {`;

    for (const [topicName, topicConfig] of Object.entries(room.topics)) {
      ret += `\n${indentLines(entityDefToCodeStr(topicName, topicConfig), 4)}`;
    }
    ret += `\n    }`;
  }

  ret += ret === '{' ? '}' : '\n  }';

  return ret;
}

function roomsCodeStr(rooms: RoomsDef) {
  let ret = '{';

  for (const [roomType, roomDef] of Object.entries(rooms)) {
    ret += `\n  "${roomType}": ${roomDefToCodeStr(roomDef)},`;
  }
  ret += ret === '{' ? '}' : '\n}';

  return ret;
}

export function generateSchemaTypescriptFile(
  prevSchema:
    | InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>
    | null
    | undefined,
  newSchema: InstantAPIPlatformSchema,
  instantModuleName: string,
): string {
  // entities
  const entitiesEntriesCode = sortedEntries(newSchema.blobs)
    .map(([name, attrs]) => schemaBlobToCodeStr(name, attrs))
    .join(',\n');
  const inferredAttrs = Object.values(newSchema.blobs)
    .flatMap(Object.values)
    .filter(
      (attr) =>
        attrFwdLabel(attr) !== 'id' &&
        deriveClientType(attr).origin === 'inferred',
    );

  const entitiesObjCode = `{\n${indentLines(entitiesEntriesCode, 2)}\n}`;

  const entitiesComment =
    inferredAttrs.length > 0
      ? `// We inferred ${inferredAttrs.length} ${easyPlural('attribute', inferredAttrs.length)}!
// Take a look at this schema, and if everything looks good,
// run \`push schema\` again to enforce the types.`
      : '';

  // links
  const linksEntries = Object.fromEntries(
    sortedEntries(newSchema.refs).map(([_name, config]) => {
      const [, fe, flabel] = config['forward-identity'];
      const [, re, rlabel] = config['reverse-identity']!;
      const [fhas, rhas] = rels[`${config.cardinality}-${config['unique?']}`];
      const desc = {
        forward: {
          on: fe,
          has: fhas,
          label: flabel,
          required: config['required?'] || undefined,
          onDelete: config['on-delete'] === 'cascade' ? 'cascade' : undefined,
        },
        reverse: {
          on: re,
          has: rhas,
          label: rlabel,
          onDelete:
            config['on-delete-reverse'] === 'cascade' ? 'cascade' : undefined,
        },
      };

      return [`${fe}${capitalizeFirstLetter(flabel)}`, desc];
    }),
  );
  const linksEntriesCode = JSON.stringify(linksEntries, null, 2).trim();

  // rooms
  const rooms = prevSchema?.rooms || {};
  const roomsCode = roomsCodeStr(rooms);
  const kv = (k: string, v: string, comment?: string) => {
    const res = comment ? `${comment}\n${k}: ${v}` : `${k}: ${v}`;
    return indentLines(res, 2);
  };

  return `// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "${instantModuleName ?? '@instantdb/core'}";

const _schema = i.schema({
${kv('entities', entitiesObjCode, entitiesComment)},
${kv('links', linksEntriesCode)},
${kv('rooms', roomsCode)}
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema }
export default schema;
`;
}
