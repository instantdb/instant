import { DBAttr, SchemaAttr, SchemaNamespace } from '@/lib/types';

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
          isPrimary: attrDesc['primary?'],
          cardinality: attrDesc.cardinality,
          linkConfig,
          inferredTypes: attrDesc['inferred-types'],
          catalog: attrDesc.catalog,
          checkedDataType: attrDesc['checked-data-type'],
          sortable: attrDesc['index?'] && !!attrDesc['checked-data-type'],
          onDelete: attrDesc['on-delete'],
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
        cardinality: attrDesc.cardinality,
        linkConfig,
        sortable: attrDesc['index?'] && !!attrDesc['checked-data-type'],
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
