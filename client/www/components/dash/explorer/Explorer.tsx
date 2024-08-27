import { id, tx } from '@instantdb/core';
import { InstantReactWeb } from '@instantdb/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isObject } from 'lodash';
import produce from 'immer';
import Fuse from 'fuse.js';
import clsx from 'clsx';
import CopyToClipboard from 'react-copy-to-clipboard';

import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  MenuIcon,
  PlusIcon,
  XIcon,
} from '@heroicons/react/solid';
import { PencilAltIcon } from '@heroicons/react/outline';

import { errorToast } from '@/lib/toast';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  Content,
  Dialog,
  Fence,
  SectionHeading,
  Select,
  TextInput,
  ToggleCollection,
  useDialog,
} from '@/components/ui';
import { DBAttr, SchemaAttr, SchemaNamespace } from '@/lib/types';
import { useIsOverflow } from '@/lib/hooks/useIsOverflow';
import { useClickOutside } from '@/lib/hooks/useClickOutside';
import { makeAttrComparator } from '@/lib/makeAttrComparator';
import { isTouchDevice } from '@/lib/config';
import { useSchemaQuery, useNamespacesQuery } from '@/lib/hooks/explorer';
import { EditNamespaceDialog } from '@/components/dash/explorer/EditNamespaceDialog';
import { EditRowDialog } from '@/components/dash/explorer/EditRowDialog';
import { useRouter } from 'next/router';

export function Explorer({ db }: { db: InstantReactWeb<any, any> }) {
  // DEV
  _dev(db);

  // ui
  const [isNsOpen, setIsNsOpen] = useState(false);
  const newNsDialog = useDialog();
  const [deleteDataConfirmationOpen, setDeleteDataConfirmationOpen] =
    useState(false);
  const [editNs, setEditNs] = useState<SchemaNamespace | null>(null);
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const nsRef = useRef<HTMLDivElement>(null);

  // nav
  const router = useRouter();
  const selectedNamespaceId = router.query.ns as string;
  const [
    navStack,
    // don't call this directly, instead call `nav`
    _setNavStack,
  ] = useState<ExplorerNav[]>([]);
  const [checkedIds, setCheckedIds] = useState<Record<string, true>>({});
  const currentNav: ExplorerNav | undefined = navStack[navStack.length - 1];
  const showBackButton = navStack.length > 1;
  const showScope = currentNav && currentNav.where && currentNav.id;
  function nav(s: ExplorerNav[]) {
    _setNavStack(s);
    setCheckedIds({});

    const current = s[s.length - 1];
    const ns = current.namespace;

    router.replace(
      {
        query: { ...router.query, ns },
      },
      undefined,
      {
        shallow: true,
      }
    );
  }
  function replaceNavStackTop(_nav: Partial<ExplorerNav>) {
    const top = navStack[navStack.length - 1];

    if (!top) return;

    nav([...navStack.slice(0, -1), { ...top, ..._nav }]);
  }
  function pushNavStack(_nav: ExplorerNav) {
    nav([...navStack, _nav]);
  }
  function popNavStack() {
    nav(navStack.slice(0, -1));
  }

  // data
  const { namespaces } = useSchemaQuery(db);
  const { selectedNamespace } = useMemo(
    () => ({
      selectedNamespace: namespaces?.find(
        (ns) => ns.id === currentNav?.namespace
      ),
    }),
    [namespaces, currentNav?.namespace]
  );

  const [limit, setLimit] = useState(50);
  const [offsets, setOffsets] = useState<{ [namespace: string]: number }>({});

  const offset = offsets[selectedNamespace?.name ?? ''] || 0;

  const { itemsRes, allCount } = useNamespacesQuery(
    db,
    selectedNamespace,
    currentNav?.where,
    currentNav?.id,
    limit,
    offset
  );

  const { allItems, fuse } = useMemo(() => {
    const allItems: Record<string, any>[] =
      itemsRes.data?.[selectedNamespace?.name ?? '']?.slice() ?? [];

    const fuse = new Fuse(allItems, {
      threshold: 0.15,
      shouldSort: false,
      keys:
        selectedNamespace?.attrs.map((a) =>
          a.type === 'ref' ? `${a.name}.id` : a.name
        ) ?? [],
    });

    return { allItems, fuse };
  }, [itemsRes.data, selectedNamespace]);

  const filteredSortedItems = useMemo(() => {
    const _items = currentNav?.search
      ? fuse.search(currentNav.search).map((r) => r.item)
      : [...allItems];

    const { sortAttr, sortAsc } = currentNav ?? {};

    if (sortAttr) {
      _items.sort(makeAttrComparator(sortAttr, sortAsc));
    }

    return _items;
  }, [
    allItems,
    fuse,
    currentNav?.search,
    currentNav?.sortAsc,
    currentNav?.sortAttr,
  ]);

  const numPages = allCount ? Math.ceil(allCount / limit) : 1;
  const currentPage = offset / limit + 1;

  useEffect(() => {
    const isFirstLoad = namespaces?.length && !navStack.length;

    if (isFirstLoad) {
      nav([{ namespace: selectedNamespaceId || namespaces[0].id }]);
    }
  }, [namespaces === null]);

  useClickOutside(nsRef, () => {
    setIsNsOpen(false);
  });

  const selectedEditableItem = useMemo(
    () => allItems.find((i) => i.id === editableRowId),
    [allItems.length, editableRowId]
  );
  const rowText = Object.keys(checkedIds).length === 1 ? 'row' : 'rows';

  return (
    <div className="relative flex w-full flex-1 overflow-hidden">
      <Dialog
        open={deleteDataConfirmationOpen}
        onClose={() => setDeleteDataConfirmationOpen(false)}
      >
        {selectedNamespace ? (
          <ActionForm className="min flex flex-col gap-4">
            <h5 className="flex text-lg font-bold">Delete {rowText}</h5>

            <Content>
              Deleting is an <strong>irreversible operation</strong>.
            </Content>

            <ActionButton
              type="submit"
              label={`Delete ${rowText}`}
              submitLabel={`Deleting ${rowText}...`}
              errorMessage={`Failed to delete ${rowText}`}
              className="border-red-500 text-red-500"
              onClick={async () => {
                try {
                  await db.transact(
                    Object.keys(checkedIds).map((id) =>
                      tx[selectedNamespace.name][id].delete()
                    )
                  );
                } catch (error) {
                  errorToast(`Failed to delete ${rowText}`);
                  return;
                }

                setCheckedIds({});
                setDeleteDataConfirmationOpen(false);
              }}
            />
          </ActionForm>
        ) : null}
      </Dialog>
      <Dialog open={Boolean(editNs)} onClose={() => setEditNs(null)}>
        {selectedNamespace ? (
          <EditNamespaceDialog
            db={db}
            namespace={selectedNamespace}
            namespaces={namespaces ?? []}
            onClose={(p) => {
              setEditNs(null);
              if (p?.ok) {
                pushNavStack({ namespace: namespaces?.[0].id });
              }
            }}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={!!selectedEditableItem}
        onClose={() => setEditableRowId(null)}
      >
        {!!selectedNamespace && !!selectedEditableItem ? (
          <EditRowDialog
            db={db}
            namespace={selectedNamespace}
            item={selectedEditableItem}
            onClose={() => setEditableRowId(null)}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={addItemDialogOpen}
        onClose={() => setAddItemDialogOpen(false)}
      >
        {selectedNamespace ? (
          <EditRowDialog
            db={db}
            item={{}}
            namespace={selectedNamespace}
            onClose={() => setAddItemDialogOpen(false)}
          />
        ) : null}
      </Dialog>
      <Dialog {...newNsDialog}>
        <NewNamespaceDialog
          db={db}
          onClose={(p) => {
            newNsDialog.onClose();

            if (p?.name) {
              pushNavStack({ namespace: p.name });
            }
          }}
        />
      </Dialog>

      <div
        ref={nsRef}
        className={clsx(
          'absolute top-0 left-0 bottom-0 z-50 flex flex-col gap-1 border-r bg-white p-2 shadow-md md:static md:flex md:shadow-none',
          {
            hidden: !isNsOpen,
          }
        )}
      >
        <div className="flex items-center gap-1 text-sm font-semibold">
          <ChevronLeftIcon
            height="1rem"
            className="cursor-pointer md:hidden"
            onClick={() => setIsNsOpen(false)}
          />
          Namespaces
        </div>
        {namespaces ? (
          <>
            <div className="overflow-y-auto overflow-x-hidden">
              {namespaces.length ? (
                <ToggleCollection
                  className="text-sm"
                  selectedId={currentNav?.namespace}
                  items={namespaces.map((ns) => ({
                    id: ns.id,
                    label: ns.name,
                  }))}
                  onChange={(ns) => {
                    pushNavStack({ namespace: ns.id });
                  }}
                />
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="mini"
              className="justify-start"
              onClick={newNsDialog.onOpen}
            >
              <PlusIcon height="1rem" /> Create
            </Button>
          </>
        ) : (
          <div className="flex w-full animate-slow-pulse flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded-md bg-gray-300"></div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 overflow-hidden border-r bg-gray-100 p-1 md:hidden">
        <button
          className="flex cursor-pointer select-none items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-300"
          onClick={(e) => {
            e.stopPropagation();
            setIsNsOpen(true);
          }}
        >
          <MenuIcon height="1rem" />
        </button>
      </div>
      {selectedNamespace && currentNav && allItems ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center border-b">
            <div className="flex flex-1 flex-col justify-between md:flex-row md:items-center">
              <div className="flex items-center border-b px-2 py-1 md:border-b-0">
                {showBackButton ? (
                  <ArrowLeftIcon
                    className="mr-4 inline cursor-pointer"
                    height="1rem"
                    onClick={popNavStack}
                  />
                ) : null}
                {showScope ? (
                  <XIcon
                    className="mr-4 inline cursor-pointer"
                    height="1rem"
                    onClick={() => {
                      pushNavStack({
                        namespace: selectedNamespace.id,
                      });
                    }}
                  />
                ) : null}
                <div className="truncate whitespace-nowrap font-mono text-xs">
                  <strong>{selectedNamespace.name}</strong>{' '}
                  {showScope ? (
                    <>
                      {' '}
                      where <strong>{currentNav.where}</strong>.
                      <strong>id</strong> ={' '}
                      <em className="rounded-sm border bg-white px-1">
                        {currentNav.id}
                      </em>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2 px-2 py-1 justify-between md:justify-start">
                <Button
                  variant="secondary"
                  size="mini"
                  onClick={() => {
                    setEditNs(selectedNamespace);
                  }}
                >
                  Edit Schema
                </Button>
                <TextInput
                  className="text-content py-0 text-sm flex-1"
                  placeholder="Filter..."
                  value={currentNav?.search ?? ''}
                  onChange={(v) => {
                    replaceNavStackTop({
                      search: v ?? undefined,
                    });
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-start space-x-2 p-1 text-xs border-b">
            <Button
              size="mini"
              variant="secondary"
              onClick={() => {
                setAddItemDialogOpen(true);
              }}
            >
              Add row
            </Button>
            <div>
              <Select
                className="text-xs"
                onChange={(opt) => opt && setLimit(parseInt(opt.value, 10))}
                value={`${limit}`}
                options={[
                  { label: '25/page', value: '25' },
                  { label: '50/page', value: '50' },
                  { label: '100/page', value: '100' },
                ]}
              />
            </div>
            {allCount == null ? (
              <div>...</div>
            ) : (
              <div>
                {(currentPage - 1) * limit + 1} -{' '}
                {Math.min(allCount, currentPage * limit)} of {allCount}
              </div>
            )}
            <button
              className="flex items-center justify-center"
              disabled={currentPage <= 1}
              onClick={() =>
                setOffsets({
                  ...offsets,
                  [selectedNamespace.name]: Math.max(0, offset - limit),
                })
              }
            >
              <ArrowLeftIcon
                className={clsx('inline', {
                  'opacity-40': currentPage <= 1,
                })}
                height="1rem"
              />
            </button>
            <div className="flex items-center space-x-1 overflow-hidden">
              {[...new Array(numPages)].map((_, i) => {
                const page = i + 1;
                if (
                  numPages > 6 &&
                  page !== 1 &&
                  page !== numPages &&
                  page !== currentPage &&
                  page !== currentPage - 1 &&
                  page !== currentPage + 1
                ) {
                  if (page === currentPage - 2 || page === currentPage + 2) {
                    return <div key={page}>...</div>;
                  }
                  return null;
                }
                return (
                  <button
                    key={page}
                    className={clsx(
                      'px-3 py-1 text-gray-600 rounded-md',
                      page === currentPage ? 'bg-gray-200' : 'hover:bg-gray-100'
                    )}
                    onClick={() =>
                      setOffsets({
                        ...offsets,
                        [selectedNamespace.name]: i * limit,
                      })
                    }
                    disabled={page === currentPage}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            <button
              className="flex items-center justify-center"
              disabled={currentPage >= numPages}
              onClick={() =>
                setOffsets({
                  ...offsets,
                  [selectedNamespace.name]: offset + limit,
                })
              }
            >
              <ArrowRightIcon
                className={clsx('inline', {
                  'opacity-40': currentPage >= numPages,
                })}
                height="1rem"
              />
            </button>
          </div>
          <div className="relative flex flex-1 overflow-x-auto overflow-y-scroll">
            <div
              className={clsx(
                'absolute top-0 right-0 left-[48px] z-30 flex items-center gap-1.5 overflow-hidden bg-white px-4 py-1.5',
                {
                  hidden: !Object.keys(checkedIds).length,
                }
              )}
            >
              <Button
                variant="destructive"
                size="mini"
                className="flex px-2 py-0 text-xs"
                onClick={() => {
                  setDeleteDataConfirmationOpen(true);
                }}
              >
                Delete {rowText}
              </Button>
            </div>
            <table className="z-0 w-full flex-1 text-left font-mono text-xs text-gray-500">
              <thead className="sticky top-0 z-20 bg-white text-gray-700 shadow">
                <tr>
                  <th className="px-2 py-2" style={{ width: '48px' }}>
                    <Checkbox
                      checked={
                        filteredSortedItems.length > 0 &&
                        Object.keys(checkedIds).length ===
                          filteredSortedItems.length
                      }
                      onChange={(checked) => {
                        if (checked) {
                          setCheckedIds(
                            Object.fromEntries(
                              filteredSortedItems.map((i) => [i.id, true])
                            )
                          );
                        } else {
                          setCheckedIds({});
                        }
                      }}
                    />
                  </th>
                  {selectedNamespace.attrs.map((attr) => (
                    <th
                      key={attr.name}
                      className={clsx(
                        'z-10 cursor-pointer select-none whitespace-nowrap px-4 py-1',
                        {
                          'bg-gray-200': currentNav.sortAttr === attr.name,
                        }
                      )}
                      onClick={() => {
                        replaceNavStackTop({
                          sortAttr: attr.name,
                          sortAsc:
                            currentNav.sortAttr !== attr.name
                              ? true
                              : !currentNav.sortAsc,
                        });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {attr.name}
                        <span>
                          {currentNav.sortAttr === attr.name ? (
                            currentNav.sortAsc ? (
                              '↓'
                            ) : (
                              '↑'
                            )
                          ) : (
                            <span className="text-gray-400">↓</span>
                          )}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {filteredSortedItems.map((item) => (
                  <tr
                    key={item.id as string}
                    className="group border-b bg-white"
                  >
                    <td
                      className="px-2 py-2 flex gap-2 items-center"
                      style={{ width: '48px' }}
                    >
                      <Checkbox
                        checked={checkedIds[item.id as string] ?? false}
                        onChange={(checked) => {
                          setCheckedIds(
                            produce(checkedIds, (draft) => {
                              if (checked) {
                                draft[item.id as string] = true;
                              } else {
                                delete draft[item.id as string];
                              }
                            })
                          );
                        }}
                      />
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setEditableRowId(item.id)}
                      >
                        <PencilAltIcon className="h-4 w-4 text-gray-500" />
                      </button>
                    </td>
                    {selectedNamespace.attrs.map((attr) => (
                      <td
                        key={attr.name}
                        className="relative px-4 py-1"
                        style={{
                          maxWidth:
                            attr.name === 'id' || attr.type === 'ref'
                              ? '40px'
                              : '80px',
                        }}
                      >
                        <ExplorerItemVal
                          item={item}
                          attr={attr}
                          onClickLink={() => {
                            const linkConfigDir =
                              attr.linkConfig[
                                !attr.isForward ? 'forward' : 'reverse'
                              ];

                            pushNavStack({
                              namespace: linkConfigDir?.namespace,
                              where: linkConfigDir?.attr,
                              id: item.id as string,
                            });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="h-full"></tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : namespaces?.length ? (
        <div className="px-4 py-2 text-sm italic text-gray-500">
          Select a namespace
        </div>
      ) : namespaces?.length === 0 ? (
        <div className="flex flex-1 flex-col md:items-center md:justify-center">
          <div className="flex flex-1 flex-col gap-4 bg-gray-100 p-6 md:max-w-[320px] md:flex-none md:border">
            <SectionHeading>This is your Data Explorer</SectionHeading>
            <Content className="text-sm">
              This is the place where you can explore all your data. Create a
              sample app, write a transaction, and changes you make will show up
              here!
            </Content>
            <Button onClick={newNsDialog.onOpen}>Create a namespace</Button>
          </div>
        </div>
      ) : (
        <div className="flex w-full animate-slow-pulse flex-col gap-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-full rounded-md bg-gray-300"></div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExplorerItemVal({
  item,
  attr,
  onClickLink,
}: {
  item: Record<string, any>;
  attr: SchemaAttr;
  onClickLink: () => void;
}) {
  const val = (item as any)[attr.name];

  const [tipOpen, setTipOpen] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const { ref: overflowRef, isOverflow } = useIsOverflow();
  const shouldShowTooltip = isOverflow || isObject(val);

  if (attr.type === 'ref') {
    const linksLen = (item as any)[attr.name]?.length ?? 0;

    if (!linksLen) {
      return (
        <div className="whitespace-nowrap px-2 text-gray-400">0 links</div>
      );
    }

    return (
      <div
        className="inline-block cursor-pointer whitespace-nowrap rounded-md px-2 hover:bg-gray-200"
        onClick={onClickLink}
      >
        {linksLen} link{linksLen === 1 ? '' : 's'}
      </div>
    );
  } else if (val === null || val === undefined) {
    return <div className="truncate text-gray-400">-</div>;
  } else {
    return (
      <Tooltip.Provider>
        <Tooltip.Root
          delayDuration={0}
          {...(isTouchDevice ? { open: shouldShowTooltip && tipOpen } : {})}
        >
          <Tooltip.Trigger
            asChild
            onMouseEnter={() => {
              setTipOpen(true);
            }}
            onMouseLeave={() => {
              setTipOpen(false);
            }}
          >
            <div className="truncate" ref={overflowRef}>
              <CopyToClipboard text={formatVal(val, true)}>
                <span
                  className="cursor-pointer"
                  onClick={() => {
                    setShowCopy(true);
                    setTimeout(() => {
                      setShowCopy(false);
                    }, 2500);
                  }}
                >
                  <Val data={showCopy ? 'Copied!' : val} />
                </span>
              </CopyToClipboard>
            </div>
          </Tooltip.Trigger>
          {shouldShowTooltip ? (
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-30"
                sideOffset={10}
                alignOffset={10}
                collisionPadding={10}
                side="bottom"
                align="start"
              >
                <div
                  className="max-w-md overflow-auto whitespace-pre border bg-white bg-opacity-80 p-2 font-mono text-xs shadow-md backdrop-blur-sm"
                  style={{
                    maxHeight: `var(--radix-popper-available-height)`,
                  }}
                >
                  <Val data={val} pretty />
                </div>
              </Tooltip.Content>
            </Tooltip.Portal>
          ) : null}
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }
}

function formatVal(data: any, pretty?: boolean): string {
  if (isObject(data)) {
    return JSON.stringify(data, null, pretty ? 2 : undefined);
  }

  return String(data);
}

function Val({ data, pretty }: { data: any; pretty?: boolean }) {
  const sanitized = formatVal(data, pretty);

  if (pretty && isObject(data)) {
    return <Fence code={sanitized} language="json" />;
  }

  return <>{sanitized}</>;
}

function NewNamespaceDialog({
  db,
  onClose,
}: {
  db: InstantReactWeb;
  onClose: (p?: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState('');

  async function onSubmit() {
    const idAttr: DBAttr = {
      id: id(),
      'forward-identity': [id(), name, 'id'],
      'value-type': 'blob',
      cardinality: 'one',
      'unique?': false,
      'index?': false,
    };

    const ops = [['add-attr', idAttr]];
    await db._core._reactor.pushOps(ops);
    onClose({ id: idAttr.id, name });
  }

  return (
    <ActionForm className="flex flex-col gap-4">
      <h5 className="flex items-center text-lg font-bold">
        Create a new namespace
      </h5>

      <TextInput label="Name" value={name} onChange={(n) => setName(n)} />

      <ActionButton
        type="submit"
        label="Create"
        submitLabel="Creating..."
        errorMessage="Failed to create namespace"
        disabled={!name}
        onClick={onSubmit}
      />
    </ActionForm>
  );
}

// TYPES

interface ExplorerNav {
  namespace?: string;
  where?: string;
  id?: string;
  sortAttr?: string;
  sortAsc?: boolean;
  search?: string;
}

// DEV

function _dev(db: InstantReactWeb) {
  if (typeof window !== 'undefined') {
    const i = {
      db,
      id,
      tx,
      dummy: (ns: string = 'dummy', o?: any) =>
        db.transact([tx[ns][id()].update({ ts: Date.now(), ...o })]),
    };
    (window as any).i = i;
  }
}
