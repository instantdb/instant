import {
  cn,
  Fence,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
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
} from '@heroicons/react/24/outline';
import { PushNavStack, TableColMeta } from './Explorer';
import { useIsOverflow } from '@/lib/hooks/useIsOverflow';
import { isObject } from 'lodash';
import copy from 'copy-to-clipboard';

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
        'group relative z-10 h-8 w-full select-none whitespace-nowrap',
      )}
      style={{
        ...style,
        width: header.getSize() !== 0 ? header.getSize() : undefined,
      }}
    >
      {header.id !== 'select-col' && (
        <button
          className="absolute inset-0 z-0"
          {...attributes}
          {...listeners}
          ref={setActivatorNodeRef}
          style={{ pointerEvents: 'auto' }}
        />
      )}
      <div className="flex h-full items-stretch justify-between overflow-hidden">
        <div
          className={`flex shrink items-center gap-1 truncate px-2 py-1 font-semibold th-${header.column.id}`}
        >
          {isSortable ? (
            <button
              className="relative z-50 flex items-center gap-1"
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
                className="opacity-0 transition-opacity group-hover:opacity-100"
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
              <div className="h-full w-[2px] bg-neutral-200 dark:bg-neutral-700"></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TableCell = ({
  cell,
  pushNavStack,
}: {
  cell: Cell<any, unknown>;
  pushNavStack: PushNavStack;
}) => {
  const resizing = cell.column.getIsResizing();

  const meta = cell.column.columnDef.meta as TableColMeta | null;
  const { isDragging, setNodeRef, transform } = useSortable({
    id: cell.column.id,
    disabled: cell.column.id === 'select-col',
  });
  const [showCopy, setShowCopy] = useState(false);
  const { ref: overflowRef, isOverflow, setIsOverflow } = useIsOverflow();
  const shouldShowTooltip =
    (isOverflow || isObject(cell.getValue())) && !meta?.isLink;

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const hasOverflow =
        overflowRef.current.scrollWidth > overflowRef.current.clientWidth ||
        overflowRef.current.scrollHeight > overflowRef.current.clientHeight;

      setIsOverflow(hasOverflow);
    });
    observer.observe(overflowRef.current!);

    return () => {
      observer.disconnect();
    };
  }, [overflowRef.current]);

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

  const realValue = cell.getValue();

  return (
    <Tooltip>
      {' '}
      <TooltipTrigger className="text-left">
        <div
          ref={(el) => {
            setNodeRef(el);
            overflowRef.current = el;
          }}
          style={{
            ...style,
            padding: disablePadding ? 0 : '0.5rem',
          }}
          className={cn(`cursor-default truncate whitespace-nowrap`)}
          key={cell.id}
        >
          <span
            className={cn(
              `h-full min-h-full cursor-pointer td-${cell.column.id}`,
              disablePadding ? '' : 'pr-2',
            )}
            onClick={() => {
              if (
                meta?.isLink &&
                meta.attr &&
                Array.isArray(realValue) &&
                realValue.length > 0
              ) {
                const attr = meta.attr;
                const linkConfigDir =
                  attr.linkConfig[!attr.isForward ? 'forward' : 'reverse'];

                if (linkConfigDir) {
                  pushNavStack({
                    namespace: linkConfigDir.namespace,
                    where: [`${linkConfigDir.attr}.id`, cell.row.original.id],
                  });
                  return;
                }
              }
              if (meta?.copyable) {
                if (copy(formatVal(realValue))) {
                  setShowCopy(true);
                  setTimeout(() => setShowCopy(false), 1000);
                }
              }
            }}
          >
            {showCopy ? (
              <div className="h-1">Copied!</div>
            ) : (
              flexRender(cell.column.columnDef.cell, cell.getContext())
            )}
          </span>
        </div>
      </TooltipTrigger>
      {shouldShowTooltip && !resizing && (
        <TooltipContent
          className={cn(isObject(realValue) && 'p-0')}
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
