import React from 'react';
import { ActionForm, Button, Divider, useDialog } from '@lib/components/ui';
import { errorToast } from '../toast';
import { SchemaNamespace, DBAttr } from '@lib/types';
import useSWR from 'swr';
import { InstantReactWebDatabase } from '@instantdb/react';
import { useEffect, useState } from 'react';
import { ArrowPathIcon, ClockIcon } from '@heroicons/react/24/outline';
import { InstantAPIError } from '@instantdb/core';
import { ExpandableDeletedAttr } from './expandable-deleted-attr';
import { useAttrNotes } from '@lib/hooks/useAttrNotes';
import { useMemo } from 'react';
import { add, formatDistanceToNow, format } from 'date-fns';
import { useExplorerProps } from '.';

// -----
// Types

export type SoftDeletedAttr = Omit<DBAttr, 'metadata'> & {
  'deletion-marked-at': string;
  metadata: {
    soft_delete_snapshot?: {
      is_indexed: boolean;
      is_required: boolean;
      id_attr_id: string;
    };
  };
};

type DeletedNamespace = {
  idAttr: SoftDeletedAttr;
  remainingCols: SoftDeletedAttr[];
};

// -----
// Hooks

export const useRecentlyDeletedAttrs = (appId: string) => {
  const explorerProps = useExplorerProps();

  const token = explorerProps.adminToken;
  const result = useSWR(['recently-deleted', appId], async () => {
    const response = await fetch(
      `${explorerProps.apiURI}/dash/apps/${appId}/soft_deleted_attrs`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const data = await response.json();
    if (!response.ok) {
      console.error('Failed to fetch recently deleted attrs', data);
      throw new Error(
        'Failed to fetch recently deleted attrs' + JSON.stringify(data),
      );
    }
    const transformedData = {
      ...data,
      attrs: data.attrs.map(withoutDeletionMarkers),
    };

    const successfulData = transformedData as {
      attrs: SoftDeletedAttr[];
      'grace-period-days': number;
    };

    return successfulData;
  });

  return result;
};

export const useRecentlyDeletedNamespaces = (
  appId: string,
): DeletedNamespace[] => {
  const { data } = useRecentlyDeletedAttrs(appId);
  const deletedNamespaces = useMemo(() => {
    const attrs = data?.attrs || [];
    const idAttrs = attrs.filter((a) => {
      return a['forward-identity'][2] === 'id';
    });
    const mapping = idAttrs.map((a) => {
      const cols = attrs.filter(
        (x) => x.metadata.soft_delete_snapshot?.id_attr_id === a.id,
      );
      return { idAttr: a, remainingCols: cols.filter((c) => a.id !== c.id) };
    });

    return mapping;
  }, [data?.attrs]);

  return deletedNamespaces;
};

// -------
// RecentlyDeletedNamespaces

export function RecentlyDeletedNamespaces({
  appId,
  db,
}: {
  db: InstantReactWebDatabase<any>;
  appId: string;
}) {
  const { data, mutate } = useRecentlyDeletedAttrs(appId);
  const deletedNamespaces = useRecentlyDeletedNamespaces(appId);
  const gracePeriodDays = data?.['grace-period-days'] || 2;

  const onRestore = async ({ idAttr, remainingCols }: DeletedNamespace) => {
    if (!db) return;
    if (!data) return;
    const ids = [idAttr, ...remainingCols].map((a) => a.id);
    await db.core._reactor.pushOps(
      ids.map((attrId) => ['restore-attr', attrId]),
    );
    const idSet = new Set(ids);
    mutate({
      ...data,
      attrs: data.attrs.filter((attr) => !idSet.has(attr.id)),
    });
  };

  return (
    <ActionForm className="flex max-w-2xl flex-col gap-4">
      <h5 className="flex items-center gap-2 text-lg font-bold">
        Recently Deleted Namespaces
      </h5>
      {deletedNamespaces.length ? (
        <div className="flex flex-col gap-2">
          {deletedNamespaces
            .toSorted((a, b) => {
              return (
                +new Date(b.idAttr['deletion-marked-at']) -
                +new Date(a.idAttr['deletion-marked-at'])
              );
            })
            .map((ns) => {
              const deletionMarkedAt = new Date(
                ns.idAttr['deletion-marked-at'],
              );
              const expiresAt = add(deletionMarkedAt, {
                days: gracePeriodDays,
              });

              return (
                <div
                  key={ns.idAttr.id}
                  className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0 dark:border-neutral-700"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold dark:text-white">
                      {ns.idAttr['forward-identity'][1]}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Deleted {format(deletionMarkedAt, 'MMM d, h:mm a')} ·{' '}
                      expires{' '}
                      {formatDistanceToNow(expiresAt, {
                        includeSeconds: false,
                      })}
                    </div>
                    {ns.remainingCols.length > 0 ? (
                      <div className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                        Columns:{' '}
                        {ns.remainingCols
                          .map((attr) => attr['forward-identity'][2])
                          .join(', ')}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        No columns
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      size="mini"
                      variant="secondary"
                      onClick={() => onRestore(ns)}
                    >
                      <ArrowPathIcon className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No recently deleted namespaces.
        </p>
      )}
    </ActionForm>
  );
}

// -------
// RecentlyDeletedAttrs

export const RecentlyDeletedAttrs: React.FC<{
  namespace: SchemaNamespace;
  appId: string;
  db: InstantReactWebDatabase<any>;
  notes: ReturnType<typeof useAttrNotes>;
}> = ({ namespace, appId, db, notes }) => {
  const { data, mutate, error } = useRecentlyDeletedAttrs(appId);

  const [expandedAttr, setExpandedAttr] = useState<string | null>(null);

  const dialog = useDialog();

  const restoreAttr = async (attrId: string) => {
    if (!db) return;
    if (!data) return;
    try {
      await db.core._reactor.pushOps([['restore-attr', attrId]]);
      mutate({
        attrs: data.attrs.filter((attr) => attr.id !== attrId) ?? [],
        'grace-period-days': data['grace-period-days'],
      });

      const attr = data.attrs.find((attr) => attr.id === attrId);
      if (attr) {
        const possibleMessage = getConstraintMessage(attr);
        if (possibleMessage) {
          notes.setNote(attrId, possibleMessage);
        }
      }
    } catch (error) {
      console.error(error);
      if (error instanceof InstantAPIError) {
        if (error.body?.type === 'record-not-unique') {
          errorToast(
            'Attribute already exists. Rename existing attribute first and then try again to restore.',
          );
        } else {
          errorToast(error.message);
        }
      } else {
        errorToast('Failed to restore attr');
      }
    }
  };

  const idAttrId = namespace.attrs.find((a) => a.name === 'id')?.id || 'unk';

  const filtered = data?.attrs?.filter(
    (attr) => attr.metadata?.soft_delete_snapshot?.id_attr_id === idAttrId,
  );

  useEffect(() => {
    if (filtered?.length === 0) {
      dialog.onClose();
    }
  }, [filtered]);

  if (error || !filtered || filtered.length === 0) {
    return null;
  }

  return (
    <div className="pb-2">
      <Divider className="pb-2">
        <div className="flex w-full grow items-center justify-center gap-2 text-center opacity-60">
          <ClockIcon width={16} />
          Recently Deleted
        </div>
      </Divider>
      <div className="flex flex-col gap-2">
        {filtered?.map((attr) => (
          <ExpandableDeletedAttr
            isExpanded={expandedAttr === attr.id}
            setIsExpanded={(isExpanded) => {
              if (isExpanded) {
                setExpandedAttr(attr.id);
              } else {
                setExpandedAttr(null);
              }
            }}
            key={attr.id}
            attr={attr}
            gracePeriodDays={data?.['grace-period-days'] || 2}
            onRestore={restoreAttr}
          />
        ))}
      </div>
    </div>
  );
};

// -------
// RecentlyDeletedNamespaces

// --------
// Helpers

const deletedMarker = '_deleted$';

const withoutDeletionMarkers = (attr: SoftDeletedAttr): SoftDeletedAttr => {
  const newAttr = { ...attr };
  const [fwdId, fwdEtype, fwdLabel] = attr['forward-identity'];
  newAttr['forward-identity'] = [
    fwdId,
    removeDeletedMarker(fwdEtype),
    removeDeletedMarker(fwdLabel),
  ];
  if (attr['reverse-identity']) {
    const [revId, revEtype, revLabel] = attr['reverse-identity']!;
    newAttr['reverse-identity'] = [
      revId,
      removeDeletedMarker(revEtype),
      removeDeletedMarker(revLabel),
    ];
  }
  return newAttr;
};

export const removeDeletedMarker = (s: string): string => {
  const idx = s.indexOf(deletedMarker);
  if (idx === -1) return s;
  return s.slice(idx + deletedMarker.length);
};

const getConstraintMessage = (attr: SoftDeletedAttr): string | null => {
  if (attr && attr?.metadata?.soft_delete_snapshot) {
    if (
      attr.metadata.soft_delete_snapshot.is_indexed &&
      attr.metadata.soft_delete_snapshot.is_required
    ) {
      return 'Index and required constraints were dropped after restoring';
    }

    if (attr.metadata.soft_delete_snapshot.is_indexed) {
      return 'Indexed constraint was dropped after restoring';
    }
    if (attr.metadata.soft_delete_snapshot.is_required) {
      return 'Required constraint was dropped after restoring';
    }
    return null;
  }
  return null;
};
