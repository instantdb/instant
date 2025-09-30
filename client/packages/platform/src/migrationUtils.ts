import { AnyBlob, AnyLink, MigrationTx } from './migrations.ts';
import { relationshipConstraints, RelationshipKinds } from './relationships.ts';

export const attrDefToNewAttrTx = (
  attrInSchema: AnyBlob,
  entityName: string,
  createdName: string,
): MigrationTx => {
  return {
    type: 'add-attr',
    'unique?': attrInSchema.config.unique,
    'value-type': 'blob',
    cardinality: 'one',
    identifier: {
      namespace: entityName,
      attrName: createdName,
    },
    'required?': attrInSchema.required,
    'forward-identity': {
      attrName: createdName,
      namespace: entityName,
    },
    'index?': attrInSchema.config.indexed,
    'checked-data-type': attrInSchema.valueType,
  };
};

export const linkDefToNewAttrTx = (link: AnyLink): MigrationTx => {
  const relationship =
    `${link.forward.has}-${link.reverse.has}` as RelationshipKinds;
  const uniqueAndCardinality = relationshipConstraints[relationship];

  return {
    'checked-data-type': null,
    'index?': false,
    ...uniqueAndCardinality,
    'required?': false,
    identifier: {
      attrName: link.forward.label,
      namespace: link.forward.on,
    },
    'value-type': 'ref',
    type: 'add-attr',
    'forward-identity': {
      attrName: link.forward.label,
      namespace: link.forward.on,
    },
    'on-delete': link.forward.onDelete,
    'on-delete-reverse': link.reverse.onDelete,
    'reverse-identity': {
      attrName: link.reverse.label,
      namespace: link.reverse.on,
    },
  };
};
