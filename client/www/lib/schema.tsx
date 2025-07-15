import { DBAttr, SchemaAttr, SchemaNamespace } from '@/lib/types';
import { InstantDBAttr } from '@instantdb/core';
import { InstantAPIPlatformSchema } from '@instantdb/platform';

// We show most attrs in the explorer except for some system attrs
function isVisibleAttr(attr: DBAttr) {
  const [, namespace, _] = attr['forward-identity'];
  return (
    attr.catalog !== 'system' ||
    namespace === '$users' ||
    namespace === '$files'
  );
}

export function dbAttrsToExplorerSchema(
  rawAttrs: Record<string, DBAttr>,
): SchemaNamespace[] {
  const nsMap: Record<
    string,
    { id: string; name: string; attrs: Record<string, SchemaAttr> }
  > = {};

  const oAttrs: Record<string, DBAttr> = {};
  for (const [id, attrDesc] of Object.entries(rawAttrs)) {
    if (!isVisibleAttr(attrDesc)) {
      continue;
    }
    oAttrs[id] = attrDesc;
  }

  for (const attrDesc of Object.values(oAttrs)) {
    const [, namespace] = attrDesc['forward-identity'];

    if (nsMap[namespace]) {
      continue;
    }

    nsMap[namespace] = { id: namespace, name: namespace, attrs: {} };
  }

  for (const attrDesc of Object.values(oAttrs)) {
    const linkConfig = {
      forward: {
        id: attrDesc['forward-identity'][0],
        namespace: attrDesc['forward-identity'][1],
        attr: attrDesc['forward-identity'][2],
        nsMap: nsMap[attrDesc['forward-identity'][1]],
      },
      reverse: attrDesc['reverse-identity']
        ? {
            id: attrDesc['reverse-identity'][0],
            namespace: attrDesc['reverse-identity'][1],
            attr: attrDesc['reverse-identity'][2],
            nsMap: nsMap[attrDesc['reverse-identity'][1]],
          }
        : undefined,
    };

    if (attrDesc['forward-identity']) {
      const [fwdId, ns, attr, fwdIndexed] = attrDesc['forward-identity'];
      const id = attrDesc.id + '-forward';

      if (fwdIndexed !== false) {
        nsMap[ns].attrs[id] = {
          id: attrDesc.id,
          isForward: true,
          namespace: ns,
          name: attr,
          type: attrDesc['value-type'],
          isIndex: attrDesc['index?'],
          isUniq: attrDesc['unique?'],
          isRequired: attrDesc['required?'],
          isPrimary: attrDesc['primary?'],
          cardinality: attrDesc.cardinality,
          linkConfig,
          inferredTypes: attrDesc['inferred-types'],
          catalog: attrDesc.catalog,
          checkedDataType: attrDesc['checked-data-type'],
          sortable: attrDesc['index?'] && !!attrDesc['checked-data-type'],
          onDelete: attrDesc['on-delete'],
          onDeleteReverse: attrDesc['on-delete-reverse'],
        };
      }
    }

    if (!attrDesc['reverse-identity']) {
      continue;
    }

    const [revId, revNs, revAttr, revIndexed] = attrDesc['reverse-identity'];

    // TODO: sometimes reverse-identity doesn't correspond to a real namespace
    if (nsMap[revNs] && revIndexed !== false) {
      const idr = attrDesc.id + '-reverse';
      nsMap[revNs].attrs[idr] = {
        id: attrDesc.id,
        isForward: false,
        namespace: revNs,
        name: revAttr,
        type: attrDesc['value-type'],
        isIndex: attrDesc['index?'],
        isUniq: attrDesc['unique?'],
        isRequired: attrDesc['required?'],
        cardinality: attrDesc.cardinality,
        linkConfig,
        sortable: attrDesc['index?'] && !!attrDesc['checked-data-type'],
        onDelete: attrDesc['on-delete'],
        onDeleteReverse: attrDesc['on-delete-reverse'],
      };
    }
  }

  const namespaces = Object.values(nsMap)
    .map((ns) => ({
      ...ns,
      attrs: Object.values(ns.attrs).sort(nameComparator),
    }))
    .sort(nameComparator);

  return namespaces;
}

function nameComparator(a: { name: string }, b: { name: string }) {
  if (a.name === 'id') return -1;
  if (b.name === 'id') return 1;

  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
}

// attrsToSchema
// Converts attrs to the instant API schema format
// Make sure any changes here match changes to instant.model.schema in Clojure

// Helpers

const FILES_URL_AID = '96653230-13ff-ffff-2a35-48afffffffff';

function dbAttrToInstantDBAttr(attr: DBAttr): InstantDBAttr {
  return {
    ...attr,
    'required?': attr['required?'] ?? false,
    'inferred-types': attr['inferred-types'] ?? null,
    catalog: attr['catalog'] ?? 'user',
    'forward-identity': [
      attr['forward-identity'][0],
      attr['forward-identity'][1],
      attr['forward-identity'][2],
    ],
    'reverse-identity': attr['reverse-identity']
      ? [
          attr['reverse-identity'][0],
          attr['reverse-identity'][1],
          attr['reverse-identity'][2],
        ]
      : undefined,
  };
}

// Transform $files.url attribute to mark it as required
function transformFilesUrlAttr(attr: DBAttr) {
  // $files.url is a derived attribute that we always return from queries.
  // It does not exist inside our database, so it's marked as optional.
  // However, to our users, it's seen as a required attribute, since we always
  // provide it.
  if (attr.id === FILES_URL_AID) {
    return { ...attr, required: true };
  }
  return attr;
}

// Remove hidden system attributes
function removeHidden(attrs: DBAttr[]) {
  return attrs.filter((attr) => {
    const catalog = attr.catalog;
    const fwdEtype = getFwdEtype(attr);
    const fwdLabel = getFwdLabel(attr);

    // Remove system attrs except $users and $files
    if (catalog === 'system' && !['$users', '$files'].includes(fwdEtype)) {
      return false;
    }

    // Remove specific $files attributes
    if (
      fwdEtype === '$files' &&
      [
        'content-type',
        'content-disposition',
        'size',
        'location-id',
        'key-version',
      ].includes(fwdLabel)
    ) {
      return false;
    }

    return true;
  });
}

function getFwdEtype(attr: DBAttr) {
  return attr['forward-identity'][1];
}

function getFwdLabel(attr: DBAttr) {
  return attr['forward-identity'][2];
}

// Make sure any changes here match changes to instant.model.schema in Clojure
// Converts attrs to the instant API schema format
export function attrsToSchema(attrs: DBAttr[]): InstantAPIPlatformSchema {
  const filteredAttrs = removeHidden(attrs).map(transformFilesUrlAttr);

  const grouped = filteredAttrs.reduce(
    (acc: { ref: DBAttr[]; blob: DBAttr[] }, attr) => {
      const valueType = attr['value-type'];
      if (!acc[valueType]) {
        acc[valueType] = [];
      }
      acc[valueType].push(attr);
      return acc;
    },
    { ref: [], blob: [] },
  );

  const blobs = grouped.blob || [];
  const refs = grouped.ref || [];

  const refsIndexed: InstantAPIPlatformSchema['refs'] = refs.reduce(
    (acc: InstantAPIPlatformSchema['refs'], attr) => {
      const {
        'forward-identity': forwardIdentity,
        'reverse-identity': reverseIdentity,
      } = attr;
      const key = JSON.stringify([
        forwardIdentity[1],
        forwardIdentity[2],
        reverseIdentity?.[1],
        reverseIdentity?.[2],
      ]);
      acc[key] = dbAttrToInstantDBAttr(attr);
      return acc;
    },
    {},
  );

  const blobsGrouped: Record<string, DBAttr[]> = blobs.reduce(
    (acc: Record<string, DBAttr[]>, blob) => {
      const entityType = getFwdEtype(blob);
      if (!acc[entityType]) {
        acc[entityType] = [];
      }
      acc[entityType].push(blob);
      return acc;
    },
    {},
  );

  const blobsIndexed: InstantAPIPlatformSchema['blobs'] = Object.entries(
    blobsGrouped,
  ).reduce((acc: InstantAPIPlatformSchema['blobs'], [entityType, attrs]) => {
    acc[entityType] = attrs.reduce(
      (attrMap: Record<string, InstantDBAttr>, attr) => {
        const attrName = attr['forward-identity'][2];
        attrMap[attrName] = dbAttrToInstantDBAttr(attr);
        return attrMap;
      },
      {},
    );
    return acc;
  }, {});

  return {
    refs: refsIndexed,
    blobs: blobsIndexed,
  };
}
