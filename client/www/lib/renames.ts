import { SchemaNamespace } from './types';

export const createRenameNamespaceOps = (
  newName: string,
  namespace: SchemaNamespace,
  namespaces: SchemaNamespace[],
) => {
  const currentName = namespace.name;
  const ops: any[] = [];
  namespace.attrs.forEach((attr) => {
    ops.push([
      'update-attr',
      {
        id: attr.id,
        'forward-identity': [
          attr.linkConfig.forward.id,
          newName,
          attr.linkConfig.forward.attr,
        ],
      },
    ]);
  });

  namespaces.forEach((ns) => {
    ns.attrs.forEach((attr) => {
      if (attr.linkConfig.reverse?.namespace === currentName) {
        ops.push([
          'update-attr',
          {
            id: attr.id,
            'reverse-identity': [
              attr.linkConfig.reverse.id,
              newName,
              attr.linkConfig.reverse.attr,
            ],
          },
        ]);
      }
    });
  });
  return ops;
};
