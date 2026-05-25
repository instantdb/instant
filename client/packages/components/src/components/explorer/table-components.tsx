import React from 'react';
import {
  cn,
  Fence,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@lib/components/ui';
import {
  Cell,
  flexRender,
  Header,
  HeaderGroup,
  Table,
} from '@tanstack/react-table';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import clsx from 'clsx';
import { CSSProperties, useEffect, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowsUpDownIcon,
  ArrowUpIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { useIsOverflow } from '@lib/hooks/useIsOverflow';
import { isObject } from 'lodash';
import copy from 'copy-to-clipboard';
import { useExplorerDialog, useExplorerProps, useExplorerState } from '.';
import { TableColMeta } from './inner-explorer';

export const TableHeader = ({
  header,
  table,
  headerGroup,
  index,
  setMinViableColWidth,
  onSort,
  currentSortAttr,
  currentSortAsc,
}: {
  header: Header<any, any>;
  table: Table<any>;
  headerGroup: HeaderGroup<any>;
  index: number;
  setMinViableColWidth: (columnId: string) => void;
  onSort?: (
    attrName: string,
    currentAttr: string | undefined,
    currentAsc?: boolean,
  ) => void;
  currentSortAttr?: string;
  currentSortAsc?: boolean;
}) => {
  const {
    attributes,
    setActivatorNodeRef,
    isDragging,
    listeners,
    setNodeRef,
    transform,
  } = useSortable({
    id: header.column.id,
    disabled: header.id === 'select-col',
  });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: 'relative',
    transform:
      header.id === 'select-col'
        ? undefined
        : CSS.Translate.toString(transform), // translate instead of transform to avoid squishing
    transition: 'width transform 0.2s ease-in-out',
    whiteSpace: 'nowrap',
    width: header.column.getSize(),
    zIndex: isDragging ? 1 : 0,
  };

  const meta = header.column.columnDef?.meta as TableColMeta | null;

  const isSortable = !!meta?.sortable;

  const headerText =
    typeof header.column.columnDef.header === 'string'
      ? header.column.columnDef.header
      : '';

  // Check if this column is currently sorted
  const isCurrentSort =
    currentSortAttr === headerText ||
    (currentSortAttr === 'serverCreatedAt' && headerText === 'id');

  return (
    <div
      key={header.id}
      ref={setNodeRef}
      className={clsx(
        'group relative z-10 h-8 w-full whitespace-nowrap select-none',
      )}
      style={{
        ...style,
        width: header.getSize() !== 0 ? header.getSize() : undefined,
      }}
    >
      {header.id !== 'select-col' && (
        <button
          className="absolute inset-0 z-0 hover:cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          ref={setActivatorNodeRef}
          style={{ pointerEvents: 'auto' }}
        />
      )}
      {header.id === 'select-col' ? (
        <div
          className={`flex h-full w-full items-center px-2 py-1 th-${header.column.id}`}
        >
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
        </div>
      ) : (
      <div className="flex h-full items-stretch justify-between overflow-hidden">
        <div
          className={`flex shrink items-center gap-1 truncate px-2 py-1 font-semibold th-${header.column.id}`}
        >
          {isSortable ? (
            <button
              className="relative z-50 flex items-center gap-1 py-2 pr-5"
              onClick={() => {
                if (onSort) {
                  let thisAttrName =
                    headerText === 'id' ? 'serverCreatedAt' : headerText;
                  onSort(thisAttrName, currentSortAttr, currentSortAsc);
                }
              }}
            >
              <span className={cn(isCurrentSort && 'underline')}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </span>
              <span
                className="opacity-50 transition-opacity group-hover:opacity-70"
                style={{
                  opacity: isCurrentSort ? 1 : undefined,
                  fontWeight: isCurrentSort ? 'bold' : 'normal',
                }}
              >
                {isCurrentSort ? (
                  currentSortAsc ? (
                    <ArrowUpIcon strokeWidth={3} width={10} />
                  ) : (
                    <ArrowDownIcon strokeWidth={3} width={10} />
                  )
                ) : (
                  <ArrowsUpDownIcon strokeWidth={3} width={10} />
                )}
              </span>
            </button>
          ) : (
            <>
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
            </>
          )}
        </div>

        <div className="flex h-full items-center justify-between">
          <div
            {...{
              onDoubleClick: () => setMinViableColWidth(header.column.id),
              onMouseDown: (e) => {
                e.stopPropagation();
                return header.getResizeHandler()(e);
              },
              onTouchStart: header.getResizeHandler(),
              className: cn(
                `resizer h-full flex justify-center z-50 ${
                  table.options.columnResizeDirection
                } ${header.column.getIsResizing() ? 'isResizing' : ''}`,
                headerGroup.headers.length - 1 == index && 'justify-end',
                header.id !== 'select-col' && 'hover:cursor-col-resize',
              ),
              style: {
                width: 8,
                pointerEvents: 'auto',
              },
            }}
          >
            {headerGroup.headers.length - 1 !== index && (
              <div className="h-full w-0.5 bg-neutral-200 dark:bg-neutral-700"></div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export const TableCell = ({ cell }: { cell: Cell<any, unknown> }) => {
  const resizing = cell.column.getIsResizing();

  const { history } = useExplorerState();
  const { setDialog } = useExplorerDialog();

  const meta = cell.column.columnDef.meta as TableColMeta | null;
  const showEditButton = meta?.editable && meta.attr;
  const { isDragging, setNodeRef, transform } = useSortable({
    id: cell.column.id,
    disabled: cell.column.id === 'select-col',
  });
  const [showCopy, setShowCopy] = useState(false);
  const { ref: overflowRef, isOverflow, setIsOverflow } = useIsOverflow();
  const realValue = cell.getValue();
  const shouldShowTooltip =
    (isOverflow || isObject(realValue)) && !meta?.isLink;

  useEffect(() => {
    const el = overflowRef.current;
    if (!el) {
      return;
    }

    const checkOverflow = () => {
      setIsOverflow(
        el.scrollWidth > el.clientWidth ||
          el.scrollHeight > el.clientHeight,
      );
    };

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [realValue, cell.column.getSize(), setIsOverflow]);

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: 'relative',
    transform:
      cell.column.id === 'select-col'
        ? undefined
        : CSS.Translate.toString(transform), // translate instead of transform to avoid squishing
    transition: 'width transform 0.2s ease-in-out',
    width: cell.column.getSize(),
    zIndex: isDragging ? 1 : 0,
  };

  const disablePadding = meta?.disablePadding ?? false;
  const isSelectCol = cell.column.id === 'select-col';

  const hasNavigableLink =
    meta?.isLink &&
    meta.attr &&
    Array.isArray(realValue) &&
    realValue.length > 0;
  const canCopy =
    meta?.copyable && isCopyableCellValue(realValue, meta);

  const cellInner = (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...(isSelectCol || disablePadding
          ? {}
          : { padding: '0.5rem' }),
      }}
      className={cn(
        'group/cell relative flex min-w-0 cursor-default items-center whitespace-nowrap',
        isSelectCol && 'px-2 py-1',
      )}
      key={cell.id}
    >
      <span
        ref={isSelectCol ? undefined : overflowRef}
        className={cn(
          `h-full min-h-full min-w-0 td-${cell.column.id}`,
          isSelectCol
            ? 'flex w-full items-center gap-2 overflow-visible'
            : cn(
                'min-w-0 flex-1 truncate',
                (hasNavigableLink || canCopy) && 'cursor-pointer',
              ),
          !isSelectCol && (disablePadding ? '' : 'pr-2'),
          showEditButton && 'pr-6',
        )}
        onClick={
          isSelectCol
            ? undefined
            : () => {
                if (hasNavigableLink && meta?.attr) {
                  const attr = meta.attr;
                  const linkConfigDir =
                    attr.linkConfig[!attr.isForward ? 'forward' : 'reverse'];

                  if (linkConfigDir) {
                    history.push({
                      namespace: linkConfigDir.namespace,
                      where: [`${linkConfigDir.attr}.id`, cell.row.original.id],
                    });
                    return;
                  }
                }
                if (canCopy && copy(formatVal(realValue))) {
                  setShowCopy(true);
                  setTimeout(() => setShowCopy(false), 1000);
                }
              }
        }
      >
        {showCopy ? (
          <div className="h-1">Copied!</div>
        ) : (
          flexRender(cell.column.columnDef.cell, cell.getContext())
        )}
      </span>
      {showEditButton ? (
        <button
          type="button"
          title={`Edit ${meta.attr.name}`}
          className="absolute top-1/2 right-1 z-20 -translate-y-1/2 rounded-xs p-0.5 opacity-0 transition-opacity group-hover/cell:opacity-100 hover:bg-neutral-100 focus-visible:opacity-100 focus-visible:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-hidden dark:hover:bg-neutral-700 dark:focus-visible:bg-neutral-700 dark:focus-visible:ring-neutral-500"
          onClick={(e) => {
            e.stopPropagation();
            setDialog({
              type: 'edit-row',
              rowId: cell.row.original.id as string,
              focusAttr: meta.attr.name,
            });
          }}
        >
          <PencilSquareIcon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
        </button>
      ) : null}
    </div>
  );

  if (isSelectCol) {
    return cellInner;
  }

  return (
    <Tooltip delayDuration={400}>
      {' '}
      <TooltipTrigger className="text-left" asChild>
        {cellInner}
      </TooltipTrigger>
      {shouldShowTooltip && !resizing && (
        <TooltipContent
          collisionPadding={10}
          className={cn(
            'max-h-[min(50vh,var(--radix-popper-available-height))] max-w-[min(75rem,80vw)] min-w-0 overflow-x-hidden overflow-y-auto whitespace-pre-wrap wrap-break-word [&_code]:wrap-break-word [&_pre]:whitespace-pre-wrap [&_pre]:wrap-break-word',
            isObject(realValue) && 'p-0',
          )}
          side="bottom"
        >
          {typeof realValue === 'string' ? (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          ) : (
            <Val pretty data={realValue} />
          )}
        </TooltipContent>
      )}
    </Tooltip>
  );
};

function isCopyableCellValue(
  value: unknown,
  meta: TableColMeta | null,
): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (meta?.isLink) {
    return Array.isArray(value) && value.length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isObject(value)) {
    return Object.keys(value).length > 0;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
}

function formatVal(data: any, pretty?: boolean): string {
  if (isObject(data)) {
    return JSON.stringify(data, null, pretty ? 2 : undefined);
  }

  return String(data);
}

function Val({ data, pretty }: { data: any; pretty?: boolean }) {
  const sanitized = formatVal(data, pretty);
  const explorerProps = useExplorerProps();

  if (pretty && isObject(data)) {
    return (
      <Fence
        darkMode={explorerProps.darkMode}
        code={sanitized}
        language="json"
      />
    );
  }

  return <>{sanitized}</>;
}
