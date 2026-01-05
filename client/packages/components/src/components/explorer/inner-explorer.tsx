import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { markdownTable } from 'markdown-table';

import { mkConfig, generateCsv, download } from 'export-to-csv';

import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
} from '@dnd-kit/sortable';
import {
  ArrowUpOnSquareIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { coerceToDate, tx } from '@instantdb/core';
import { InstantReactAbstractDatabase } from '@instantdb/react';
import {
  ColumnDef,
  ColumnSizingState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CurlyBraces,
  FileDown,
  PlusIcon,
  Table,
} from 'lucide-react';
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useExplorerProps, useExplorerState } from '.';
import { SearchInput } from './search-input';

import { errorToast, successToast } from '@lib/components/toast';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  cn,
  Content,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Fence,
  IconButton,
  Select,
} from '@lib/components/ui';
import { SearchFilter, useNamespacesQuery } from '@lib/hooks/explorer';
import { useColumnVisibility } from '@lib/hooks/useColumnVisibility';
import { useLocalStorage } from '@lib/hooks/useLocalStorage';
import { SchemaAttr, SchemaNamespace } from '@lib/types';
import { formatBytes } from '@lib/utils/format';
import { getTableWidthSize } from '@lib/utils/tableWidthSize';
import { ArrowRightFromLine } from 'lucide-react';
import { TableCell, TableHeader } from './table-components';
import { ViewSettings } from './view-settings';

import { isObject } from 'lodash';
import { EditNamespaceDialog } from './edit-namespace-dialog';
import { EditRowDialog } from './edit-row-dialog';
import copy from 'copy-to-clipboard';

const fallbackItems: any[] = [];

export type TableColMeta = {
  sortable?: boolean;
  disablePadding: boolean;
  isLink?: boolean;
  attr: SchemaAttr;
  copyable?: boolean;
};

function exportToCSV(
  rows: any[],
  columns: ColumnDef<any>[],
  namespace: string,
  downloadFile: boolean = false,
) {
  if (rows.length === 0) return;

  const visibleColumns = columns.filter(
    (col) =>
      col.id !== 'select-col' &&
      col.header !== undefined &&
      !(col.meta as TableColMeta | undefined)?.isLink,
  );

  const data = rows.map((row) => {
    const rowData: Record<string, any> = {};
    visibleColumns.forEach((col: any) => {
      const value = row[col.header];
      // Handle different data types
      if (value === null || value === undefined) {
        rowData[col.header] = '';
      } else if (typeof value === 'object') {
        rowData[col.header] = JSON.stringify(value);
      } else {
        rowData[col.header] = value;
      }
    });
    return rowData;
  });

  const csvConfig = mkConfig({
    fieldSeparator: ',',
    filename: `${namespace}_export`,
    decimalSeparator: '.',
    useKeysAsHeaders: true,
  });

  const csv = generateCsv(csvConfig)(data);

  if (downloadFile) {
    download(csvConfig)(csv);
    successToast('CSV file downloaded');
  } else {
    copy(csv.toString());
    successToast('CSV copied to clipboard');
  }
}

function exportToMarkdown(
  rows: any[],
  columns: any[],
  namespace: string,
  downloadFile: boolean = false,
) {
  if (rows.length === 0) return;

  const visibleColumns = columns.filter(
    (col) =>
      col.id !== 'select-col' &&
      col.header !== undefined &&
      !(col.meta as TableColMeta | undefined)?.isLink,
  );

  const headers = visibleColumns.map((col: any) => col.header as string);

  const data = rows.map((row) => {
    return visibleColumns.map((col: any) => {
      const value = row[col.header];
      if (value === null || value === undefined) {
        return ' ';
      } else if (typeof value === 'object') {
        return JSON.stringify(value);
      } else {
        return String(value);
      }
    });
  });

  const markdown = markdownTable([headers, ...data]);

  if (downloadFile) {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${namespace}_export.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    successToast('Markdown file downloaded');
  } else {
    copy(markdown);
    successToast('Markdown copied to clipboard');
  }
}

function exportToJSON(
  rows: any[],
  columns: any[],
  namespace: string,
  downloadFile: boolean = false,
) {
  if (rows.length === 0) return;

  const visibleColumns = columns.filter(
    (col) =>
      col.id !== 'select-col' &&
      col.header !== undefined &&
      !(col.meta as TableColMeta | undefined)?.isLink,
  );

  const data = rows.map((row) => {
    const rowData: Record<string, any> = {};
    visibleColumns.forEach((col: any) => {
      const value = row[col.header];
      rowData[col.header] = value;
    });
    return rowData;
  });

  const json = JSON.stringify(data, null, 2);

  if (downloadFile) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${namespace}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    successToast('JSON file downloaded');
  } else {
    copy(json);
    successToast('JSON copied to clipboard');
  }
}

export const InnerExplorer: React.FC<{
  db: InstantReactAbstractDatabase<any, any>;
  namespaces: SchemaNamespace[];
}> = ({ db, namespaces }) => {
  const { explorerState, history } = useExplorerState();
  const explorerProps = useExplorerProps();

  const currentNav = explorerState;
  const selectedNamespace = namespaces.find(
    (ns) => ns.id === currentNav.namespace,
  );

  const [limit, setLimit] = useState(50);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [deleteDataConfirmationOpen, setDeleteDataConfirmationOpen] =
    useState(false);
  const [editNs, setEditNs] = useState<SchemaNamespace | null>(null);
  const [editableRowId, setEditableRowId] = useState<string | null>(null);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const nsRef = useRef<HTMLDivElement>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const [offsets, setOffsets] = useState<{ [namespace: string]: number }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSystemCatalogNs = selectedNamespace?.name?.startsWith('$') ?? false;
  const sanitizedNsName = selectedNamespace?.name ?? '';
  const readOnlyNs =
    isSystemCatalogNs && !['$users', '$files'].includes(sanitizedNsName);
  const offset = offsets[sanitizedNsName] || 0;

  const sortAttr = currentNav?.sortAttr || 'serverCreatedAt';
  const sortAsc = currentNav?.sortAsc ?? true;

  const handleRangeSelection = (currentId: string, checked: boolean) => {
    const allItemIds = table.options.data.map((i) => i.id as string);
    const currentIndex = allItemIds.indexOf(currentId);
    const lastSelectedIndex = allItemIds.indexOf(lastSelectedIdRef.current!);
    const [start, end] = [
      Math.min(currentIndex, lastSelectedIndex),
      Math.max(currentIndex, lastSelectedIndex),
    ];

    setCheckedIds((prev) => {
      const newCheckedIds = { ...prev };
      for (let i = start; i <= end; i++) {
        const id = allItemIds[i];
        if (checked) {
          newCheckedIds[id] = true;
        } else {
          delete newCheckedIds[id];
        }
      }
      return newCheckedIds;
    });
  };

  const [searchFilters, setSearchFilters] = useState<SearchFilter[]>([]);

  const { itemsRes, allCount } = useNamespacesQuery(
    db,
    selectedNamespace,
    currentNav?.where,
    currentNav?.filters || searchFilters,
    limit,
    offset,
    sortAttr,
    sortAsc,
  );

  const allItems =
    itemsRes.data?.[selectedNamespace?.name ?? ''] ?? fallbackItems;

  function getSelectedRows(
    allItems: ({ id: string } & Record<string, any>)[],
    checkedIds: Record<string, true | false>,
  ) {
    return allItems.filter((item) => checkedIds[item.id]);
  }

  const numPages = allCount ? Math.ceil(allCount / limit) : 1;

  const currentPage = offset / limit + 1;

  const [localDates, setLocalDates] = useLocalStorage('localDates', false);

  const handleUploadFile = async () => {
    try {
      setUploadingFile(true);
      if (selectedFiles.length === 0) {
        return;
      }

      const [file] = selectedFiles;
      const success = await upload(
        explorerProps.adminToken,
        explorerProps.appId,
        file,
        customPath,
        explorerProps.apiURI,
      );

      if (success) {
        setSelectedFiles([]);
        setCustomPath('');
        fileInputRef.current && (fileInputRef.current.value = '');
      }

      // await refreshFiles();
      successToast('Successfully uploaded!');
    } catch (err: any) {
      console.error('Failed to upload:', err);
      errorToast(`Failed to upload: ${err.body.message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const tableItems = useMemo(() => {
    return allItems;
  }, [allItems]);

  const tableRef = useRef<HTMLDivElement>(null);
  const [leftShadowOpacity, setLeftShadowOpacity] = useState(0);
  const [rightShadowOpacity, setRightShadowOpacity] = useState(1);
  const [tableSmallerThanViewport, setTableSmallerThanViewport] =
    useState(false);

  const setMinViableColWidth = (columnId: string) => {
    // for some reason the id column wants to resize bigger
    if (table?.getColumn(columnId)?.columnDef.header === 'id') {
      setColumnWidth(columnId, 285);
      return;
    }
    const size = getTableWidthSize(columnId, 800);
    setColumnWidth(columnId, size);
  };

  const setColumnWidth = (columnId: string, width = 200) => {
    if (!selectedNamespace) {
      return;
    }
    const result: Record<string, number> = {};
    selectedNamespace?.attrs.forEach((attr) => {
      result[attr.id + attr.name] =
        table.getColumn(attr.id + attr.name)?.getSize() || 0;
    });
    table.setColumnSizing({
      ...result,
      [columnId]: width,
    });
  };

  const columns = useMemo(() => {
    const result: ColumnDef<any>[] = [];

    result.push({
      id: 'select-col',
      enableSorting: false,
      accessorFn: () => null,
      enableHiding: false,
      enableResizing: false,
      size: 52,
      header: ({ table }) => {
        return (
          <Checkbox
            className="relative z-10 text-[#2563EB] dark:checked:border-[#2563EB] dark:checked:bg-[#2563EB]"
            style={{
              pointerEvents: 'auto',
            }}
            checked={table.getIsAllRowsSelected()}
            onChange={(checked) => {
              if (checked) {
                table.toggleAllRowsSelected();
                // Use the first item as the last selected ID
                if (allItems.length > 0) {
                  lastSelectedIdRef.current = allItems[0].id as string;
                }
              } else {
                setCheckedIds({});
                lastSelectedIdRef.current = null;
              }
            }}
          />
        );
      },
      cell: ({ row, column }) => {
        return (
          <div className="flex h-1 justify-around gap-2">
            <Checkbox
              className="relative z-10 text-[#2563EB] dark:checked:border-[#2563EB] dark:checked:bg-[#2563EB]"
              checked={row.getIsSelected()}
              onChange={(_, e) => {
                const isShiftPressed = e.nativeEvent
                  ? (e.nativeEvent as MouseEvent).shiftKey
                  : false;

                if (isShiftPressed && lastSelectedIdRef.current) {
                  handleRangeSelection(row.id as string, e.target.checked);
                } else {
                  // Regular single click selection
                  setCheckedIds((prev) => {
                    const newCheckedIds = { ...prev };
                    if (e.target.checked) {
                      newCheckedIds[row.id] = true;
                    } else {
                      delete newCheckedIds[row.id];
                    }
                    return newCheckedIds;
                  });
                }

                lastSelectedIdRef.current = row.id;
              }}
            />
            {readOnlyNs ? null : (
              <button
                className="translate-y-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => setEditableRowId(row.id)}
              >
                <PencilSquareIcon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
              </button>
            )}
          </div>
        );
      },
    });

    selectedNamespace?.attrs?.forEach((attr) => {
      result.push({
        id: attr.id + attr.name,
        header: attr.name,
        enableSorting: true,
        enableResizing: true,
        accessorFn: (row) => row[attr.name],
        meta: {
          sortable: attr.sortable || attr.name === 'id',
          copyable: true,
          isLink: attr.type === 'ref',
          attr,
          disablePadding: attr.namespace === '$files' && attr.name === 'url',
        } satisfies TableColMeta,
        cell: (info) => {
          if (
            info.row.original[attr.name] === null ||
            info.row.original[attr.name] === undefined
          ) {
            return <div className="h-1">-</div>;
          }
          if (attr.type === 'ref') {
            const linkCount = info.row.original[attr.name].length;
            return (
              <div
                className={cn(
                  'h-1 translate-y-0.5',
                  linkCount < 1 && 'opacity-50',
                )}
              >
                {linkCount} link{linkCount === 1 ? '' : 's'}
              </div>
            );
          }

          if (attr.namespace === '$files') {
            if (attr.name === 'url') {
              return (
                <a
                  className="h-full w-full pl-2 align-middle text-xs font-bold underline hover:text-black dark:hover:text-white"
                  href={info.row.original['url'] as string}
                  target="_blank"
                >
                  View File
                </a>
              );
            } else if (attr.name === 'size') {
              return formatBytes(info.row.original[attr.name]);
            }
          }

          if (attr.checkedDataType === 'boolean') {
            return info.row.original[attr.name] ? 'true' : 'false';
          }
          if (attr.checkedDataType === 'date') {
            const coerced = coerceToDate(info.row.original[attr.name]);

            if (localDates) {
              return coerced?.toLocaleString() || info.row.original[attr.name];
            } else {
              return info.row.original[attr.name];
            }
          }
          if (isObject(info.row.original[attr.name])) {
            return <Val data={info.row.original[attr.name]}></Val>;
          }
          return info.row.original[attr.name];
        },
      });
    });

    return result;
  }, [selectedNamespace?.attrs, localDates]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const distributeRemainingWidth = () => {
    const result = Object.entries(table.getState().columnSizing).reduce(
      (acc, [colId, width]) => {
        if (colVisiblity.visibility[colId] !== false) {
          return {
            ...acc,
            [colId]: width,
          };
        } else {
          return acc;
        }
      },
      {} as Record<string, number>,
    );

    const fullWidth = tableRef.current?.clientWidth || -1;

    const totalWidth = Object.values(result).reduce(
      (acc, width) => acc + width,
      0,
    );
    const remainingWidth = fullWidth - 52 - totalWidth;

    if (remainingWidth > 0) {
      const numColumns = Object.keys(result).length;
      const extraWidth = remainingWidth / numColumns;

      Object.keys(result).forEach((key) => {
        result[key] += extraWidth;
      });
    }
    setTableSmallerThanViewport(false);
    table.setColumnSizing(() => {
      return { ...result };
    });
  };

  const columnResizeMode = 'onChange';

  const columnResizeDirection = 'ltr';

  const colVisiblity = useColumnVisibility({
    appId: explorerProps.appId,
    attrs: selectedNamespace?.attrs,
    namespaceId: selectedNamespace?.id,
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    columns.map((c) => c.id!),
  );

  // Sync columnOrder when namespace changes
  useLayoutEffect(() => {
    if (selectedNamespace?.attrs) {
      const savedOrder = localStorage.getItem(
        `order-${selectedNamespace.id}-${explorerProps.appId}`,
      );
      if (savedOrder) {
        setColumnOrder(JSON.parse(savedOrder));
      } else {
        const newOrder = selectedNamespace.attrs.map(
          (attr) => attr.id + attr.name,
        );
        setColumnOrder(['select-col', ...newOrder]);
      }
    }
  }, [selectedNamespace?.attrs]);

  // Persist columnOrder to localStorage when it changes
  useEffect(() => {
    if (selectedNamespace?.id) {
      localStorage.setItem(
        `order-${selectedNamespace.id}-${explorerProps.appId}`,
        JSON.stringify(columnOrder),
      );
    }
  }, [columnOrder, selectedNamespace?.id]);

  const [checkedIds, setCheckedIds] = useState<Record<string, true | false>>(
    {},
  );

  // Clear selection when namespace changes
  useEffect(() => {
    setCheckedIds({});
    lastSelectedIdRef.current = null;
  }, [selectedNamespace?.id]);

  const numItemsSelected = Object.keys(checkedIds).length;
  const rowText =
    sanitizedNsName === '$files'
      ? numItemsSelected === 1
        ? 'file'
        : 'files'
      : numItemsSelected === 1
        ? 'row'
        : 'rows';

  const table = useReactTable({
    columnResizeDirection,
    columnResizeMode,
    onColumnVisibilityChange: colVisiblity.setVisibility,
    columns: columns,
    data: tableItems,
    enableColumnResizing: true,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    onColumnOrderChange: setColumnOrder,
    onRowSelectionChange: setCheckedIds,
    onColumnSizingChange: setColumnSizing,
    state: {
      columnSizing: columnSizing,
      columnOrder,
      columnVisibility: colVisiblity.visibility,
      rowSelection: checkedIds,
    },
  });

  const [isShiftPressed, setIsShiftPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    const handleWindowBlur = () => {
      setIsShiftPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur-sm', handleWindowBlur);
    };
  }, []);

  const [dropdownOpen, setDropdownOpen] = useState(false);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Prevent dragging the select column or dragging over it
    if (
      active &&
      over &&
      active.id !== over.id &&
      active.id !== 'select-col' &&
      over.id !== 'select-col'
    ) {
      setColumnOrder((columnOrder) => {
        const oldIndex = columnOrder.indexOf(active.id as string);
        const newIndex = columnOrder.indexOf(over.id as string);
        return arrayMove(columnOrder, oldIndex, newIndex); //this is just a splice util
      });
    }
  }

  const selectedEditableItem = useMemo(
    () => allItems.find((i) => i.id === editableRowId),
    [allItems.length, editableRowId],
  );

  // Handle scroll to update shadow opacity
  useEffect(() => {
    const tableElement = tableRef.current;
    if (!tableElement) return;

    const handleScroll = () => {
      const tableWidth = table.getCenterTotalSize();
      const viewportWidth = tableElement.clientWidth;

      setTableSmallerThanViewport(tableWidth < viewportWidth - 5);

      const { scrollLeft, scrollWidth, clientWidth } = tableElement;
      const maxScroll = scrollWidth - clientWidth;
      if (maxScroll <= 0) {
        setLeftShadowOpacity(0);
        setRightShadowOpacity(0);
        return;
      }
      const leftOpacity = Math.min(scrollLeft / 30, 1);
      setLeftShadowOpacity(leftOpacity);

      const rightOpacity = Math.min((maxScroll - scrollLeft) / 30, 1);
      setRightShadowOpacity(rightOpacity);
    };

    handleScroll();
    tableElement.addEventListener('scroll', handleScroll);

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(tableElement);
    const tableContent = tableElement.firstElementChild;
    if (tableContent) {
      resizeObserver.observe(tableContent);
    }

    window.addEventListener('resize', handleScroll);

    return () => {
      tableElement.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleScroll);
    };
  }, [selectedNamespace, tableItems]);

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  // history.items is a list of PAST histories, not including current
  const showBackButton = history.items.length >= 1;

  const transformAttrNameToWidth = (name: string) => {
    if (name === 'id') {
      return 140;
    }
    if (name === 'url') {
      return 120;
    }
    return name.length * 7.2 + 50;
  };
  // evenly space width of columns on first render
  useLayoutEffect(() => {
    if (selectedNamespace?.id) {
      if (
        localStorage.getItem(
          `$sizing-${selectedNamespace.id}-${explorerProps.appId}`,
        )
      ) {
        const savedSizing = JSON.parse(
          localStorage.getItem(
            `sizing-${selectedNamespace.id}-${explorerProps.appId}`,
          ) || '{}',
        );
        table.setColumnSizing(() => {
          return { ...savedSizing };
        });
        return;
      }

      const fullWidth = tableRef.current?.clientWidth || -1;
      const result: Record<string, number> = {};

      selectedNamespace?.attrs.forEach((attr) => {
        result[attr.id + attr.name] = transformAttrNameToWidth(attr.name);
      });

      const totalWidth = Object.values(result).reduce(
        (acc, width) => acc + width,
        0,
      );

      // Distribute the remaining width equally
      const remainingWidth = fullWidth - 52 - totalWidth;
      if (remainingWidth > 0) {
        const numColumns = Object.keys(result).length;
        const extraWidth = remainingWidth / numColumns;

        Object.keys(result).forEach((key) => {
          result[key] += extraWidth;
        });
      }

      table.setColumnSizing(result);
    }
  }, [tableRef.current, selectedNamespace]);

  if (!selectedNamespace) {
    return null;
  }

  const selectedNamespaceId = selectedNamespace.id;

  return (
    <>
      <Dialog
        title="Delete Rows"
        open={deleteDataConfirmationOpen}
        onClose={() => setDeleteDataConfirmationOpen(false)}
      >
        {selectedNamespace ? (
          <ActionForm className="min flex flex-col gap-4">
            <h5 className="flex text-lg font-bold">Delete {rowText}</h5>

            <Content>
              Deleting is an{' '}
              <strong className="dark:text-white">
                irreversible operation
              </strong>{' '}
              and will{' '}
              <strong className="dark:text-white">
                delete {numItemsSelected} {rowText}{' '}
              </strong>
              associated with{' '}
              <strong className="dark:text-white">
                {selectedNamespace.name}
              </strong>
              .
            </Content>

            <ActionButton
              type="submit"
              disabled={readOnlyNs}
              label={`Delete ${rowText}`}
              submitLabel={`Deleting ${rowText}...`}
              errorMessage={`Failed to delete ${rowText}`}
              className="border-red-500 text-red-500"
              title={
                readOnlyNs
                  ? `The ${selectedNamespace?.name} namespace is read-only.`
                  : undefined
              }
              onClick={async () => {
                try {
                  if (selectedNamespace.name === '$files') {
                    const filenames = allItems
                      .filter((i) => i.id in checkedIds)
                      .map((i) => i.path as string);
                    await bulkDeleteFiles(
                      explorerProps.adminToken,
                      explorerProps.appId,
                      filenames,
                      explorerProps.apiURI,
                    );
                  } else {
                    await db.transact(
                      Object.keys(checkedIds).map((id) =>
                        tx[selectedNamespace.name][id].delete(),
                      ),
                    );
                  }
                } catch (error: any) {
                  const errorMessage = error.message;
                  errorToast(
                    `Failed to delete ${rowText}${errorMessage ? `: ${errorMessage}` : ''}`,
                  );
                  return;
                }

                setCheckedIds({});
                setDeleteDataConfirmationOpen(false);
              }}
            />
          </ActionForm>
        ) : null}
      </Dialog>
      <Dialog
        title="Edit Row"
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
      <Dialog
        title="Edit Row"
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
        title="Edit Namespace"
        stopFocusPropagation={true}
        open={Boolean(editNs)}
        onClose={() => setEditNs(null)}
      >
        {selectedNamespace ? (
          <EditNamespaceDialog
            readOnly={readOnlyNs}
            isSystemCatalogNs={isSystemCatalogNs}
            db={db}
            namespace={selectedNamespace}
            namespaces={namespaces ?? []}
            onClose={(p) => {
              setEditNs(null);
              if (p?.ok) {
                history.push({ namespace: namespaces?.[0].id });
              }
            }}
          />
        ) : null}
      </Dialog>
      <div className="flex flex-1 grow flex-col overflow-hidden bg-white dark:bg-neutral-800">
        <div className="flex items-center overflow-hidden border-b border-b-gray-200 dark:border-neutral-700">
          <div className="flex flex-1 flex-col justify-between py-2 md:flex-row md:items-center">
            <div className="flex items-center overflow-hidden border-b px-2 py-1 pl-4 md:border-b-0 dark:border-neutral-700">
              {showBackButton ? (
                <ArrowLeftIcon
                  className="mr-4 inline cursor-pointer"
                  height="1rem"
                  onClick={() => history.pop()}
                />
              ) : null}
              {currentNav.where ? (
                <XMarkIcon
                  className="mr-4 inline cursor-pointer"
                  height="1rem"
                  onClick={() => {
                    history.push(
                      {
                        namespace: selectedNamespace.id,
                      },
                      true,
                    );
                  }}
                />
              ) : null}
              <div className="text-ellipses shrink truncate overflow-hidden font-mono text-xs whitespace-nowrap dark:text-white">
                <strong>{selectedNamespace.name}</strong>{' '}
                {currentNav.where ? (
                  <>
                    {' '}
                    where <strong>{currentNav.where[0]}</strong> ={' '}
                    <em className="rounded-xs border bg-white px-1 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
                      {JSON.stringify(currentNav.where[1])}
                    </em>
                  </>
                ) : null}
                {currentNav?.filters?.length ? (
                  <span
                    title={currentNav.filters
                      .map(([attr, op, search]) => `${attr} ${op} ${search}`)
                      .join(' || ')}
                  >
                    {currentNav.filters.map(([attr, op, search], i) => (
                      <span key={attr}>
                        <em className="rounded-xs border bg-white px-1 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
                          {attr} {op} {search}
                        </em>
                        {currentNav?.filters?.length &&
                        i < currentNav.filters.length - 1
                          ? ' || '
                          : null}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex justify-between gap-2 px-2 py-1 md:justify-start">
              <Button
                className="rounded-sm dark:bg-neutral-700/50"
                variant="secondary"
                size="mini"
                onClick={() => {
                  setEditNs(selectedNamespace);
                }}
              >
                Edit Schema
              </Button>
              <SearchInput
                key={selectedNamespaceId}
                onSearchChange={(filters) => setSearchFilters(filters)}
                attrs={selectedNamespace?.attrs}
                initialFilters={currentNav?.filters || []}
              />
            </div>
          </div>
        </div>
        {selectedNamespace.name === '$files' ? (
          <div className="flex gap-2 px-2 py-2">
            <div className="flex w-full gap-2">
              <div className="flex shrink-0 gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="flex cursor-pointer rounded-sm border border-neutral-200 bg-transparent px-1 pt-1.5 text-sm shadow-xs transition-colors file:rounded-xs file:border-none file:border-neutral-200 file:bg-transparent file:p-2 file:pt-1 file:text-sm file:font-medium file:shadow-none placeholder:text-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-950 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:file:border-neutral-700 dark:file:text-white dark:placeholder:text-neutral-400 dark:focus-visible:ring-neutral-400"
                  onChange={(e: React.ChangeEvent<any>) => {
                    const files = e.target.files;
                    setSelectedFiles(files);
                    if (files?.[0]) {
                      setCustomPath(files[0].name);
                    }
                  }}
                />
                <Button
                  variant="primary"
                  disabled={selectedFiles.length === 0}
                  size="mini"
                  loading={uploadingFile}
                  onClick={handleUploadFile}
                  className="rounded-sm"
                >
                  {uploadingFile ? 'Uploading...' : 'Upload file'}
                </Button>
              </div>
              <div className="relative flex max-w-[67vw] min-w-0 flex-1 rounded-sm border border-neutral-200 focus-within:ring-2 focus-within:ring-blue-700 dark:border-neutral-700 dark:focus-within:ring-blue-500">
                <span className="absolute inset-y-0 left-0 flex items-center rounded-l bg-neutral-100 px-3 text-sm text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                  File Path:
                </span>
                <input
                  type="text"
                  placeholder="Enter a custom path (optional)"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  className="h-9 w-full rounded-sm border-0 bg-transparent py-1 pr-3 pl-24 text-sm ring-0 placeholder:text-neutral-500 focus:outline-none dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-400"
                />
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-start space-x-2 border-b border-b-gray-200 p-1 text-xs dark:border-neutral-700 dark:text-white">
          {selectedNamespace.name !== '$files' ? (
            <Button
              disabled={readOnlyNs}
              title={
                readOnlyNs
                  ? `The ${selectedNamespace?.name} namespace is read-only.`
                  : undefined
              }
              size="mini"
              variant="secondary"
              onClick={() => {
                setAddItemDialogOpen(true);
              }}
            >
              <PlusIcon width={12} />
              Add row
            </Button>
          ) : null}
          <div
            className={cn(
              'px-1',
              selectedNamespace.name === '$files' && 'pb-1',
            )}
          >
            <Select
              className="rounded-sm text-xs"
              onChange={(opt) => {
                if (!opt) return;

                const newLimit = parseInt(opt.value, 10);
                setLimit(newLimit);
                history.push((prev) => ({
                  ...prev,
                  limit: newLimit,
                }));
              }}
              value={`${limit}`}
              options={[
                { label: '25/page', value: '25' },
                { label: '50/page', value: '50' },
                { label: '100/page', value: '100' },
              ]}
            />
          </div>
          <div className="w-[62px]">
            {allCount !== undefined &&
              (allCount === 0 ? (
                <>No Results</>
              ) : (
                <>
                  {(currentPage - 1) * limit + 1} -{' '}
                  {Math.min(allCount, currentPage * limit)} of {allCount}
                </>
              ))}
          </div>
          <button
            className="flex items-center justify-center"
            disabled={currentPage <= 1}
            onClick={() => {
              setOffsets({
                ...offsets,
                [selectedNamespace.name]: Math.max(0, offset - limit),
              });
              history.push((prev) => ({
                ...prev,
                page: Math.max(1, currentPage - 1),
              }));
            }}
          >
            <ArrowLeftIcon
              className={cn('inline', {
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
                  className={cn(
                    'rounded-md px-3 py-1 text-neutral-600 dark:text-neutral-300',
                    page === currentPage
                      ? 'bg-neutral-200 dark:bg-neutral-700'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  )}
                  onClick={() => {
                    setOffsets({
                      ...offsets,
                      [selectedNamespace.name]: i * limit,
                    });
                    history.push((prev) => ({
                      ...prev,
                      page,
                    }));
                  }}
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
            onClick={() => {
              setOffsets({
                ...offsets,
                [selectedNamespace.name]: offset + limit,
              });
              history.push((prev) => ({
                ...prev,
                page: Math.min(numPages, currentPage + 1),
              }));
            }}
          >
            <ArrowRightIcon
              className={cn('inline', {
                'opacity-40': currentPage >= numPages,
              })}
              height="1rem"
            />
          </button>
          {numItemsSelected > 0 && (
            <div className="flex items-center gap-2 pl-4">
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger>
                  <Button
                    onClick={() => {
                      setDropdownOpen(true);
                    }}
                    variant="secondary"
                  >
                    <ArrowUpOnSquareIcon width={14} />
                    Export ({numItemsSelected})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="z-100"
                  align="end"
                  side="bottom"
                  sideOffset={5}
                >
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      const selectedRows = getSelectedRows(
                        allItems,
                        checkedIds,
                      );
                      exportToCSV(
                        selectedRows,
                        columns,
                        selectedNamespace.name,
                        isShiftPressed,
                      );
                      setDropdownOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Table width={12} />
                    {isShiftPressed ? 'Download as CSV' : 'Copy as CSV'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      const selectedRows = getSelectedRows(
                        allItems,
                        checkedIds,
                      );
                      exportToMarkdown(
                        selectedRows,
                        columns,
                        selectedNamespace.name,
                        isShiftPressed,
                      );
                      setDropdownOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <FileDown width={12} />
                    {isShiftPressed
                      ? 'Download as Markdown'
                      : 'Copy as Markdown'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      const selectedRows = getSelectedRows(
                        allItems,
                        checkedIds,
                      );
                      exportToJSON(
                        selectedRows,
                        columns,
                        selectedNamespace.name,
                        isShiftPressed,
                      );
                      setDropdownOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <CurlyBraces width={12} />
                    {isShiftPressed ? 'Download as JSON' : 'Copy as JSON'}
                  </DropdownMenuItem>
                  {!isShiftPressed && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-xs text-neutral-500 dark:text-neutral-400"
                        disabled
                      >
                        Hold shift to download as file
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => {
                  setDeleteDataConfirmationOpen(true);
                }}
                className="px-2"
                variant="destructive"
              >
                <TrashIcon width={14} />
                Delete Selected Rows
              </Button>
            </div>
          )}
          <div className="grow" />
          <div className="px-2">
            <ViewSettings
              localDates={localDates}
              setLocalDates={setLocalDates}
              visiblity={colVisiblity}
            />
          </div>
        </div>

        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <div className="relative flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-900/50">
            {!tableSmallerThanViewport && (
              <div
                className="absolute top-0 right-0 bottom-0 z-50 w-[30px] bg-linear-to-l from-black/20 via-black/5 to-transparent transition-opacity duration-150"
                style={{
                  pointerEvents: 'none',
                  opacity: rightShadowOpacity,
                  display: rightShadowOpacity == 0 ? 'none' : undefined,
                }}
              />
            )}
            <div
              className="absolute top-0 bottom-0 left-0 z-50 w-[30px] bg-linear-to-r from-black/10 via-black/0 to-transparent transition-opacity duration-150"
              style={{
                pointerEvents: 'none',
                opacity: leftShadowOpacity,
                display: leftShadowOpacity == 0 ? 'none' : undefined,
              }}
            />
            <div ref={tableRef} className="h-full w-full overflow-auto">
              <div className="flex w-max items-start">
                <div
                  style={{
                    width: table.getCenterTotalSize(),
                  }}
                  className="z-0 text-left font-mono text-xs text-neutral-500 dark:text-neutral-400"
                >
                  <div className="sticky top-0 z-10 border-r border-b border-gray-200 border-r-gray-200 bg-white text-neutral-700 shadow-sm dark:border-r-neutral-700 dark:border-b-neutral-600 dark:bg-[#303030] dark:text-neutral-300">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <div className={'flex w-full'} key={headerGroup.id}>
                        <SortableContext
                          items={columnOrder}
                          strategy={horizontalListSortingStrategy}
                        >
                          {headerGroup.headers.map((header, i) => (
                            <TableHeader
                              key={header.id}
                              header={header}
                              table={table}
                              headerGroup={headerGroup}
                              index={i}
                              setMinViableColWidth={setMinViableColWidth}
                              onSort={(attrName, currentAttr, currentAsc) => {
                                history.push((prev) => ({
                                  ...prev,
                                  sortAttr: attrName,
                                  sortAsc:
                                    currentAttr !== attrName
                                      ? true
                                      : !currentAsc,
                                }));
                              }}
                              currentSortAttr={currentNav?.sortAttr}
                              currentSortAsc={currentNav?.sortAsc}
                            />
                          ))}
                        </SortableContext>
                      </div>
                    ))}
                  </div>
                  <div>
                    {table.getRowModel().rows.map((row) => (
                      <div
                        className="group flex border-r border-b border-r-gray-200 border-b-gray-200 bg-white dark:border-neutral-700 dark:border-r-neutral-700 dark:bg-neutral-800"
                        key={row.id}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <SortableContext
                            key={cell.id}
                            items={columnOrder}
                            strategy={horizontalListSortingStrategy}
                          >
                            <TableCell key={cell.id} cell={cell} />
                          </SortableContext>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {tableSmallerThanViewport && (
                  <div className="sticky top-0">
                    <IconButton
                      className="opacity-60"
                      labelDirection="bottom"
                      label="Fill Width"
                      icon={<ArrowRightFromLine />}
                      onClick={distributeRemainingWidth}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </DndContext>
      </div>
    </>
  );
};

function formatVal(data: any, pretty?: boolean): string {
  if (isObject(data)) {
    return JSON.stringify(data, null, pretty ? 2 : undefined);
  }

  return String(data);
}

function Val({ data, pretty }: { data: any; pretty?: boolean }) {
  const props = useExplorerProps();
  const sanitized = formatVal(data, pretty);

  if (pretty && isObject(data)) {
    return <Fence darkMode={props.darkMode} code={sanitized} language="json" />;
  }

  return <>{sanitized}</>;
}

// Storage
export async function jsonFetch(
  input: RequestInfo,
  init: RequestInit | undefined,
): Promise<any> {
  const res = await fetch(input, init);
  const json = await res.json();
  return res.status === 200
    ? Promise.resolve(json)
    : Promise.reject({ status: res.status, body: json });
}

async function upload(
  token: string,
  appId: string,
  file: File,
  customFilename: string,
  apiUri: string,
): Promise<boolean> {
  const headers = {
    app_id: appId,
    path: customFilename || file.name,
    authorization: `Bearer ${token}`,
    'content-type': file.type,
  };

  const data = await jsonFetch(`${apiUri}/dash/apps/${appId}/storage/upload`, {
    method: 'PUT',
    headers,
    body: file,
  });

  return data;
}

async function bulkDeleteFiles(
  token: string,
  appId: string,
  filenames: string[],
  apiUri: string,
): Promise<any> {
  const { data } = await jsonFetch(
    `${apiUri}/dash/apps/${appId}/storage/files/delete`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ filenames }),
    },
  );

  return data;
}
