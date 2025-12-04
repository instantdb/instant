import React from 'react';
import { useExplorerProps } from '.';
import { SchemaNamespace } from '@lib/types';
import { Dialog, useDialog } from '../ui';
import { RecentlyDeletedNamespaces } from './recently-deleted';
import { useStableDB } from '@lib/hooks/useStableDB';

// Holds the explorer table itself and also the sidebar to select / create namespaces
export const ExplorerLayout = ({
  namespaces,
  db,
}: {
  namespaces: SchemaNamespace[];
  db: ReturnType<typeof useStableDB>;
}) => {
  const props = useExplorerProps();

  const recentlyDeletedNsDialog = useDialog();
  const selectedNamespace = namespaces.find(
    (ns) => ns.id === props.explorerState?.namespace,
  );

  return (
    <div className="relative flex w-full flex-1 overflow-hidden dark:bg-neutral-800">
      <Dialog {...recentlyDeletedNsDialog}>
        <RecentlyDeletedNamespaces appId={props.appId} db={db} />
      </Dialog>
      <pre>
        {JSON.stringify(
          namespaces.map((n) => n.name),
          null,
          2,
        )}
      </pre>
    </div>
  );
};
