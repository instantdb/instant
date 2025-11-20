import { Divider, useDialog } from '@/components/ui';
import config from '@/lib/config';
import { SchemaNamespace, DBAttr } from '@/lib/types';
import useSWR from 'swr';
import { errorToast } from '@/lib/toast';
import { InstantReactWebDatabase } from '@instantdb/react';
import { useEffect, useState } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { InstantAPIError } from '@instantdb/core';
import { ExpandableDeletedAttr } from './ExpandableDeletedAttr';
import { useAttrNotes } from '@/lib/hooks/useAttrNotes';
import { useAuthToken } from '@/lib/auth';

// -----
// Types

export type SoftDeletedAttr = Omit<DBAttr, 'metadata'> & {
  'deletion-marked-at': string;
  metadata: {
    soft_delete_snapshot: {
      is_indexed: boolean;
      is_required: boolean;
      id_attr_id: string;
    };
  };
};

export type DeletedNamespace = {
  idAttr: SoftDeletedAttr;
  columns: SoftDeletedAttr[];
};

// -----
// Hooks

export const useRecentlyDeletedAttrs = (appId: string) => {
  const token = useAuthToken();
  const result = useSWR(['recently-deleted', appId], async () => {
    const response = await fetch(
      `${config.apiURI}/dash/apps/${appId}/soft_deleted_attrs`,
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
      await db._core._reactor.pushOps([['restore-attr', attrId]]);
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

      console.log('Restored attr:', attrId);
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
    (attr) => attr.metadata?.soft_delete_snapshot.id_attr_id === idAttrId,
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
            namespace={namespace}
            gracePeriodDays={data?.['grace-period-days'] || 2}
            onRestore={restoreAttr}
          />
        ))}
      </div>
    </div>
  );
};

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
