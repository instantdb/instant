import {
  AttrsDefs,
  CardinalityKind,
  DataAttrDef,
  EntityDef,
  InstantDBAttr,
  InstantDBCheckedDataType,
  InstantDBIdent,
  InstantSchemaDef,
  LinkAttrDef,
  RoomsDef,
} from '@instantdb/core';

import {
  indentLines,
  joinWithTrailingSep,
  sortedEntries,
  formatKey,
  GenericSchemaDef,
} from './util.ts';

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

function attrDefToCodeString([name, attr]: [
  string,
  DataAttrDef<string, boolean, boolean>,
]) {
  const type =
    (attr.metadata.derivedType as any)?.type || attr.valueType || 'any';
  const unique = attr.config.unique ? '.unique()' : '';
  const index = attr.config.indexed ? '.indexed()' : '';
  const required = attr.required ? '' : '.optional()';
  return `${formatKey(name)}: i.${type}()${unique}${index}${required}`;
}

function entityDefToCodeStr(
  name: string,
  edef: EntityDef<
    AttrsDefs,
    Record<string, LinkAttrDef<CardinalityKind, string>>,
    any
  >,
) {
  const attrBlock = joinWithTrailingSep(
    sortedEntries(edef.attrs).map(attrDefToCodeString),
    ',\n',
    ',',
  );

  // a block of code for each entity
  return `${formatKey(name)}: i.entity({${attrBlock.length ? '\n' : ''}${indentLines(attrBlock, 2)}${attrBlock.length ? '\n' : ''}})`;
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

function easyPlural(strn: string, n: number) {
  return n === 1 ? strn : strn + 's';
}

function roomDefToCodeStr(room: RoomsDef[string]) {
  let ret = '{';

  if (room.presence) {
    ret += `\n${indentLines(entityDefToCodeStr('presence', room.presence), 4)},`;
  }

  if (room.topics) {
    ret += `\n    "topics": {`;

    for (const [topicName, topicConfig] of Object.entries(room.topics)) {
      ret += `\n${indentLines(entityDefToCodeStr(topicName, topicConfig), 6)},`;
    }
    ret += `\n    }`;
  }

  ret += ret === '{' ? '}' : '\n  }';

  return ret;
}

function roomsCodeStr(rooms: RoomsDef) {
  let ret = '{';

  for (const [roomType, roomDef] of Object.entries(rooms)) {
    ret += `\n  ${formatKey(roomType)}: ${roomDefToCodeStr(roomDef)},`;
  }
  ret += ret === '{' ? '}' : '\n}';

  return ret;
}

export function generateSchemaTypescriptFile(
  prevSchema: GenericSchemaDef | null | undefined,
  newSchema: GenericSchemaDef,
  instantModuleName: string,
): string {
  // entities
  const entitiesEntriesCode = joinWithTrailingSep(
    sortedEntries(newSchema.entities).map(([etype, entityDef]) =>
      entityDefToCodeStr(etype, entityDef),
    ),
    ',\n',
    ',',
  );

  const inferredAttrs: DataAttrDef<string, boolean, boolean>[] = [];

  for (const entity of Object.values(newSchema.entities)) {
    for (const attr of Object.values(entity.attrs)) {
      if ((attr.metadata.derivedType as any)?.origin === 'inferred') {
        inferredAttrs.push(attr);
      }
    }
  }

  const entitiesObjCode = `{\n${indentLines(entitiesEntriesCode, 2)}\n}`;

  const entitiesComment =
    inferredAttrs.length > 0
      ? `// We inferred ${inferredAttrs.length} ${easyPlural('attribute', inferredAttrs.length)}!
// Take a look at this schema, and if everything looks good,
// run \`push schema\` again to enforce the types.`
      : '';

  const linksEntriesCode = JSON.stringify(newSchema.links, null, 2).trim();

  // rooms
  const rooms = prevSchema?.rooms || {};
  const roomsCode = roomsCodeStr(rooms);
  const kv = (k: string, v: string, comment?: string) => {
    const res = comment ? `${comment}\n${k}: ${v}` : `${k}: ${v}`;
    return indentLines(res, 2);
  };

  const code = `// Docs: https://www.instantdb.com/docs/modeling-data

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

  return code;
}
