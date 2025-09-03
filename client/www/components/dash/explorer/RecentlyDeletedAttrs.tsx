import { Button, Dialog, SectionHeading, useDialog } from '@/components/ui';
import config from '@/lib/config';
import { SchemaNamespace, InstantApp, DBAttr } from '@/lib/types';
import { useDashFetch } from '@/lib/hooks/useDashFetch';
import useSWR from 'swr';
import { errorToast } from '@/lib/toast';
import { InstantReactWebDatabase } from '@instantdb/react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/solid';
import { add, formatDistanceToNow } from 'date-fns';
import { useEffect } from 'react';

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
  const dashResponse = useDashFetch();
  const app = dashResponse.data?.apps?.find((a: InstantApp) => a.id === appId);

  const { data, mutate } = useRecentlyDeletedAttrs(appId, app?.admin_token);

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
      errorToast('Failed to restore attr');
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

  if (!filtered || filtered?.length === 0) {
    return null;
  }

  const DeletedAttr = ({ attr }: { attr: NonNullable<typeof filtered>[0] }) => {
    if (!data) return null;
    const date = add(new Date(attr['deletion-marked-at']), {
      days: data['grace-period-days'],
    });
    return (
      <div className="border justify-between items-center px-4 flex border-gray-200 bg-gray-50 p-2">
        <div className="flex gap-4 items-center">
          <div className="font-mono">{attr.names[namespace.name]}</div>
          <div className="text-xs opacity-40">
            Deletes permanently in {formatDistanceToNow(date)}
          </div>
        </div>
        <Button onClick={() => restoreAttr(attr.id)}>
          <ArrowUturnLeftIcon fontWeight={800} width={15} />
          Restore
        </Button>
      </div>
    );
  };

  return (
    <>
      <Button
        className="px-3 gap-2 items-center"
        variant="subtle"
        onClick={dialog.toggleOpen}
      >
        <ClockIcon width={15}></ClockIcon>
        <div className="text-sm">Recently Deleted Attributes</div>
      </Button>
      <Dialog {...dialog}>
        <SectionHeading className="font-light pb-2">
          Recently Deleted Attributes
        </SectionHeading>
        <div className="space-y-2">
          {filtered?.map((attr) => <DeletedAttr key={attr.id} attr={attr} />)}
        </div>
      </Dialog>
    </>
  );
};

const useRecentlyDeletedAttrs = (appId: string, adminToken?: string) => {
  const result = useSWR(
    adminToken ? ['recently-deleted', appId] : null,
    async () => {
      const response = await fetch(
        `${config.apiURI}/admin/soft_deleted_attrs`,
        {
          method: 'GET',
          headers: {
            'app-id': appId,
            authorization: `Bearer ${adminToken}`,
          },
        },
      );
      const data = await response.json();
      if (!response.ok) {
        errorToast('Failed to get recently deleted attrs');
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
