import React, { useRef, useState } from 'react';
import { useExplorerProps } from '.';
import { SchemaNamespace } from '@lib/types';
import { Button, cn, Dialog, ToggleCollection, useDialog } from '../ui';
import {
  RecentlyDeletedNamespaces,
  useRecentlyDeletedNamespaces,
} from './recently-deleted';
import { useStableDB } from '@lib/hooks/useStableDB';
import { ChevronLeftIcon, PlusIcon } from '@heroicons/react/24/solid';
import { NewNamespaceDialog } from './new-namespace-dialog';

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
  const newNsDialog = useDialog();

  const selectedNamespace = namespaces.find(
    (ns) => ns.id === props.explorerState?.namespace,
  );
  const [isNsOpen, setIsNsOpen] = useState(false);
  const deletedNamespaces = useRecentlyDeletedNamespaces(props.appId);
  const nsRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative flex w-full flex-1 overflow-hidden dark:bg-neutral-800">
      <Dialog {...recentlyDeletedNsDialog}>
        <RecentlyDeletedNamespaces appId={props.appId} db={db} />
      </Dialog>
      <Dialog {...newNsDialog}>
        <NewNamespaceDialog
          db={db}
          onClose={(p) => {
            newNsDialog.onClose();

            if (p?.name) {
              props.setExplorerState({ namespace: p.name });
            }
          }}
        />
      </Dialog>

      <div
        ref={nsRef}
        className={cn(
          'absolute top-0 bottom-0 left-0 z-40 flex min-w-[200px] flex-col gap-1 border-r bg-white p-2 shadow-md md:static md:flex md:shadow-none dark:border-neutral-700 dark:bg-neutral-800',
          {
            hidden: !isNsOpen,
          },
        )}
      >
        <div className="flex items-center gap-1 text-sm font-semibold dark:text-white">
          <ChevronLeftIcon
            height="1rem"
            className="cursor-pointer md:hidden dark:text-white"
            onClick={() => setIsNsOpen(false)}
          />
          Namespaces
        </div>
        {namespaces ? (
          <>
            <div className="overflow-x-hidden overflow-y-auto">
              {namespaces.length ? (
                <ToggleCollection
                  className="text-sm"
                  selectedId={props.explorerState?.namespace}
                  items={namespaces.map((ns) => ({
                    id: ns.id,
                    label: ns.name,
                  }))}
                  onChange={(ns) => {
                    props.setExplorerState({ namespace: ns.id });
                  }}
                />
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="mini"
              className="justify-center"
              onClick={newNsDialog.onOpen}
            >
              <PlusIcon height="1rem" /> Create
            </Button>
            {deletedNamespaces.length ? (
              <Button
                className="justify-start gap-2 rounded-sm p-2"
                variant="subtle"
                size="nano"
                onClick={recentlyDeletedNsDialog.onOpen}
              >
                <span className="rounded-sm bg-gray-200 px-1">
                  {deletedNamespaces.length}
                </span>
                <span>Recently Deleted</span>
              </Button>
            ) : null}
          </>
        ) : (
          <div className="animate-slow-pulse flex w-full flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-4 w-full rounded-md bg-neutral-300 dark:bg-neutral-700"
              ></div>
            ))}
          </div>
        )}
      </div>
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
