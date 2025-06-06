import {
  AttrsDefs,
  CardinalityKind,
  EntityDef,
  InstantDBAttr,
  InstantDBCheckedDataType,
  InstantDBInferredType,
  InstantSchemaDef,
  LinksDef,
  RoomsDef,
} from '@instantdb/core';

export function sortedEntries<T>(o: Record<string, T>): [string, T][] {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

export function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export const rels: Record<string, CardinalityKind[]> = {
  'many-false': ['many', 'many'],
  'one-true': ['one', 'one'],
  'many-true': ['many', 'one'],
  'one-false': ['one', 'many'],
};

export function indentLines(s: string, n = 2) {
  if (!s) {
    return s;
  }
  const space = ' '.repeat(n);
  return s
    .split('\n')
    .map((l) => `${space}${l}`)
    .join('\n');
}

export function joinWithTrailingSep(
  arr: string[],
  sep: string,
  trailingSep: string = sep,
): string {
  const s = arr.join(sep);
  if (arr.length) {
    return s + trailingSep;
  }
  return s;
}

export function inferredType(attr: InstantDBAttr) {
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

export function deriveClientType(attr: InstantDBAttr): {
  type: InstantDBCheckedDataType | InstantDBInferredType | 'any';
  origin: 'checked' | 'inferred' | 'unknown';
} {
  if (attr['checked-data-type']) {
    return { type: attr['checked-data-type'], origin: 'checked' };
  }

  const inferred = inferredType(attr);

  if (inferred) {
    return { type: inferred, origin: 'inferred' };
  }

  return { type: 'any', origin: 'unknown' };
}

export function formatKey(key: string) {
  return `"${key}"`;
  // It would be nice to generate unquoted keys, but we use JSON.stringify
  // for some things so we can't be consistent with it unless we write our own
  // stringify function. If we do, here's the code for formatting keys:
  // if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
  //   return key;
  // }
  // return `"${key}"`;
}

export type GenericSchemaDef = InstantSchemaDef<
  Record<string, EntityDef<AttrsDefs, any, any>>,
  LinksDef<Record<string, EntityDef<AttrsDefs, any, any>>>,
  RoomsDef
>;
