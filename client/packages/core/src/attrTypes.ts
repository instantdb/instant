type id = string;
type etype = string;
type label = string;

export type InstantDBIdent = [id, etype, label];

export type InstantDBInferredType = 'number' | 'string' | 'boolean' | 'json';

export type InstantDBCheckedDataType = 'number' | 'string' | 'boolean' | 'date';

export type InstantDBAttrOnDelete = 'cascade';

export type InstantDBAttr = {
  id: string;
  'value-type': 'blob' | 'ref';
  cardinality: 'many' | 'one';
  'forward-identity': InstantDBIdent;
  'reverse-identity'?: InstantDBIdent | null | undefined;
  'unique?': boolean;
  'index?': boolean;
  'required?': boolean;
  'inferred-types': InstantDBInferredType[] | null;
  catalog: 'system' | 'user';
  'on-delete'?: InstantDBAttrOnDelete | null | undefined;
  'on-delete-reverse'?: InstantDBAttrOnDelete | null | undefined;
  'checked-data-type'?: InstantDBCheckedDataType | null | undefined;
  'indexing?'?: boolean;
  'setting-unique?'?: boolean;
};
