import { Button, Divider, useDialog } from '@/components/ui';
import config from '@/lib/config';
import { SchemaNamespace, InstantApp, DBAttr } from '@/lib/types';
import { useDashFetch } from '@/lib/hooks/useDashFetch';
import useSWR from 'swr';
import { errorToast } from '@/lib/toast';
import { InstantReactWebDatabase } from '@instantdb/react';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/solid';
import { add, formatDistanceToNow } from 'date-fns';
import { useEffect } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { InstantAPIError } from '@instantdb/core';

type SoftDeletedAttr = DBAttr & {
  'deletion-marked-at': string;
};

const getNamesByNamespace = (
  softDeletedAttr: SoftDeletedAttr,
): Record<string, string> => {
  const result: Record<string, string> = {};
  result[softDeletedAttr['forward-identity'][1].split('$')[1]] =
    softDeletedAttr['forward-identity'][2].split('$')[1];

  if (softDeletedAttr['reverse-identity']) {
    result[softDeletedAttr['reverse-identity'][1].split('$')[1]] =
      softDeletedAttr['reverse-identity'][2].split('$')[1];
  }
  return result;
};

export const RecentlyDeletedAttrs: React.FC<{
  namespace: SchemaNamespace;
  appId: string;
  db: InstantReactWebDatabase<any>;
}> = ({ namespace, appId, db }) => {
  const { data, mutate, error } = useRecentlyDeletedAttrs(appId);

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
      console.log('Restored attr:', attrId);
    } catch (error) {
      console.error(error);
      if (error instanceof InstantAPIError) {
        errorToast(error.message);
      } else {
        errorToast('Failed to restore attr');
      }
    }
  };

  const filtered = data?.attrs
    ?.map((attr) => ({
      ...attr,
      names: getNamesByNamespace(attr),
    }))
    .filter((attr) => Object.keys(attr.names).includes(namespace.name));

  useEffect(() => {
    if (filtered?.length === 0) {
      dialog.onClose();
    }
  }, [filtered]);

  if (error || !filtered || filtered.length === 0) {
    return null;
  }

  const DeletedAttr = ({ attr }: { attr: NonNullable<typeof filtered>[0] }) => {
    if (!data) return null;
    const date = add(new Date(attr['deletion-marked-at']), {
      days: data['grace-period-days'],
    });
    return (
      <div className="flex justify-between">
        <div className="flex gap-4 items-center">
          <span className="py-0.5 font-bold">{attr.names[namespace.name]}</span>
          <span className="py-0.5 opacity-30">
            Fully deletes in{' '}
            {formatDistanceToNow(date, { includeSeconds: false })}
          </span>
        </div>
        <Button
          className="px-2"
          size="mini"
          variant="subtle"
          onClick={() => restoreAttr(attr.id)}
        >
          <ArrowUturnLeftIcon fontWeight={800} width={15} />
          Restore
        </Button>
      </div>
    );
  };

  return (
    <div className="pb-2">
      <Divider className="pb-2">
        <div className="opacity-60 items-center justify-center flex gap-2 grow w-full text-center">
          <ClockIcon width={16} />
          Recently Deleted
        </div>
      </Divider>
      <div className="flex flex-col gap-2">
        {filtered?.map((attr) => <DeletedAttr key={attr.id} attr={attr} />)}
      </div>
    </div>
  );
};

export const useRecentlyDeletedAttrs = (appId: string) => {
  const dashResponse = useDashFetch();
  const app = dashResponse.data?.apps?.find((a: InstantApp) => a.id === appId);
  const result = useSWR(
    app?.id ? ['recently-deleted', appId] : null,
    async () => {
      if (!app) {
        throw new Error('No app found'); // should never happen
      }
      const response = await fetch(
        `${config.apiURI}/admin/soft_deleted_attrs`,
        {
          method: 'GET',
          headers: {
            'app-id': appId,
            authorization: `Bearer ${app.admin_token}`,
          },
        },
      );
      const data = await response.json();
      if (!response.ok) {
        errorToast('Failed to get recently deleted attrs');
        console.error('Failed to fetch recently deleted attrs', data);
        throw new Error(
          'Failed to fetch recently deleted attrs' + JSON.stringify(data),
        );
      }
      const successfulData = data as {
        attrs: SoftDeletedAttr[];
      };
      return { ...successfulData, 'grace-period-days': 2 };
    },
  );

  return result;
};
