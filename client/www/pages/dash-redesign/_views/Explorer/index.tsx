export { Current as ExplorerView } from './Current';

export type ExplorerSubState =
  | 'files'
  | 'todos'
  | 'add-row'
  | 'edit-row'
  | 'edit-schema'
  | 'edit-schema-rename'
  | 'edit-schema-add-data'
  | 'edit-schema-add-link'
  | 'edit-schema-edit-attr'
  | 'new-namespace'
  | 'recently-deleted-ns';

export const EXPLORER_SUB_STATES: {
  key: ExplorerSubState;
  label: string;
}[] = [
  { key: 'files', label: '$files' },
  { key: 'todos', label: 'todos' },
  { key: 'add-row', label: 'Add row' },
  { key: 'edit-row', label: 'Edit row' },
  { key: 'edit-schema', label: 'Edit schema' },
  { key: 'edit-schema-rename', label: '↳ Rename namespace' },
  { key: 'edit-schema-add-data', label: '↳ Add data attr' },
  { key: 'edit-schema-add-link', label: '↳ Add link attr' },
  { key: 'edit-schema-edit-attr', label: '↳ Edit attr' },
  { key: 'new-namespace', label: 'New namespace' },
  { key: 'recently-deleted-ns', label: 'Recently deleted' },
];
