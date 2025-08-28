import { Dialog, useDialog } from '@/components/ui';
import config from '@/lib/config';
import { SchemaNamespace, InstantApp, DBAttr } from '@/lib/types';
import { useDashFetch } from '@/lib/hooks/useDashFetch';
import useSWR from 'swr';
import { errorToast } from '@/lib/toast';
import { InstantReactWebDatabase } from '@instantdb/react';

export const RecentlyDeletedAttrs: React.FC<{
  namespace: SchemaNamespace;
  appId: string;
  db: InstantReactWebDatabase<any>;
}> = ({ namespace, appId, db }) => {
  const dashResponse = useDashFetch();
  const app = dashResponse.data?.apps?.find((a: InstantApp) => a.id === appId);

  const { data: deleted, mutate } = useRecentlyDeletedAttrs(
    appId,
    app?.admin_token,
  );

  const dialog = useDialog();

  const restoreAttr = async (attrId: string) => {
    if (!db) return;
    try {
      await db._core._reactor.pushOps([['restore-attr', attrId]]);
      mutate(deleted?.filter((attr) => (attr.id === attrId ? false : true)));
      console.log('Restored attr:', attrId);
    } catch (error) {
      errorToast('Failed to restore attr');
    }
  };

  const filtered = deleted
    ?.map((attr) => ({
      ...attr,
      entity: attr['forward-identity'][1].split('$')[1],
      fieldName: attr['forward-identity'][2].split('$')[1],
    }))
    .filter((attr) => attr.entity === namespace.name);

  // if (filtered?.length === 0) {
  //   return null;
  // }

  return (
    <div>
      <button onClick={dialog.toggleOpen}>Open me {filtered?.length}</button>
      <Dialog {...dialog}>
        <div>
          {filtered?.map((attr) => (
            <div
              key={attr.id}
              onClick={() => {
                restoreAttr(attr.id);
              }}
            >
              {attr.entity}: {attr.fieldName}
            </div>
          ))}
        </div>
      </Dialog>
    </div>
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
        'soft-deleted-attrs': (DBAttr & {
          'deletion-marked-at': string;
        })[];
      };
      return successfulData['soft-deleted-attrs'];
    },
  );

  return result;
};
