import { id, tx } from '@instantdb/core';
import { InstantReactWebDatabase } from '@instantdb/react';
import { isObject, debounce, last } from 'lodash';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
} from 'react';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import clsx from 'clsx';
import CopyToClipboard from 'react-copy-to-clipboard';
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';

import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  Bars3Icon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { PencilSquareIcon } from '@heroicons/react/24/outline';

import { successToast, errorToast } from '@/lib/toast';
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
import { isTouchDevice } from '@/lib/config';
import {
  useSchemaQuery,
  useNamespacesQuery,
  SearchFilter,
} from '@/lib/hooks/explorer';
import { TokenContext } from '@/lib/contexts';
import { EditNamespaceDialog } from '@/components/dash/explorer/EditNamespaceDialog';
import { EditRowDialog } from '@/components/dash/explorer/EditRowDialog';
import { useRouter } from 'next/router';
import { formatBytes } from '@/lib/format';

// Helper functions for handling search filters in URLs
function filtersToQueryString(filters: SearchFilter[]): string | null {
  if (!filters.length) return null;
  return JSON.stringify(filters);
}

function parseFiltersFromQueryString(
  queryString: string | null,
): SearchFilter[] {
  if (!queryString) return [];
  try {
    return JSON.parse(queryString);
  } catch (e) {
    console.error('Failed to parse filters from query string:', e);
    return [];
  }
}

const OPERATORS = [':', '>', '<'] as const;
type ParsedQueryPart = {
  field: string;
  operator: (typeof OPERATORS)[number];
  value: string;
};
function parseSearchQuery(s: string): ParsedQueryPart[] {
  let fieldStart = 0;
  let currentPart: ParsedQueryPart | undefined;
  let valueStart;
  const parts: ParsedQueryPart[] = [];
  let i = -1;
  for (const c of s) {
    i++;

    if (c === ' ' && !(OPERATORS as readonly string[]).includes(s[i + 1])) {
      fieldStart = i + 1;
      continue;
    }
    if ((OPERATORS as readonly string[]).includes(c)) {
      if (currentPart && valueStart != null) {
        currentPart.value = s.substring(valueStart, fieldStart).trim();
        parts.push(currentPart);
      }
      currentPart = {
        field: s.substring(fieldStart, i).trim(),
        operator: c as (typeof OPERATORS)[number],
        value: '',
      };

      valueStart = i + 1;
      continue;
    }
  }
  if (currentPart && valueStart != null) {
    currentPart.value = s.substring(valueStart).trim();
    // Might push twice here...
    parts.push(currentPart);
  }
  return parts;
}

function opToInstaqlOp(op: ':' | '<' | '>'): '=' | '$gt' | '$lt' {
  switch (op) {
    case ':':
      // Not really an instaql op, but we have special handling in
      // explorer.tsx to turn `=` into {k: v}
      return '=';
    case '<':
      return '$lt';
    case '>':
      return '$gt';
    default:
      throw new Error('what kind of op is this? ' + op);
  }
}

function queryToFilters({
  query,
  attrsByName,
  stringIndexed,
}: {
  query: string;
  attrsByName: { [key: string]: SchemaAttr };
  stringIndexed: SchemaAttr[];
}): SearchFilter[] {
  if (!query.trim()) {
    return [];
  }
  const parsed = parseSearchQuery(query);
  const parts: SearchFilter[] = parsed.flatMap(
    (part: ParsedQueryPart): SearchFilter[] => {
      const attr = attrsByName[part.field];
      if (!attr || !part.value) {
        return [];
      }
      if (
        part.value.toLowerCase() === 'null' &&
        part.operator === ':' &&
        !attr.isRequired
      ) {
        return [[part.field, '$isNull', null]];
      }

      const res: SearchFilter[] = [];
      if (attr.checkedDataType && attr.isIndex) {
        if (attr.checkedDataType === 'string') {
          const val = part.value;
          return [
            [
              part.field,
              val === val.toLowerCase() ? '$ilike' : '$like',
              `%${part.value}%`,
            ],
          ];
        }
        if (attr.checkedDataType === 'number') {
          try {
            return [
              [
                part.field,
                opToInstaqlOp(part.operator),
                JSON.parse(part.value),
              ],
            ];
          } catch (e) {}
        }
        if (attr.checkedDataType === 'date') {
          try {
            return [
              [
                part.field,
                opToInstaqlOp(part.operator),
                JSON.parse(part.value),
              ],
            ];
          } catch (e) {
            // Might be a string date
            return [[part.field, opToInstaqlOp(part.operator), part.value]];
          }
        }
      }
      for (const inferredType of attr.inferredTypes || ['json']) {
        switch (inferredType) {
          case 'boolean':
          case 'number': {
            try {
              res.push([
                part.field,
                opToInstaqlOp(part.operator),
                JSON.parse(part.value),
              ]);
            } catch (e) {}
            break;
          }
          default: {
            res.push([part.field, opToInstaqlOp(part.operator), part.value]);
            break;
          }
        }
      }
      return res;
    },
  );

  if (!parsed.length && query.trim() && stringIndexed.length) {
    for (const a of stringIndexed) {
      parts.push([
        a.name,
        query.toLowerCase() === query ? '$ilike' : '$like',
        `%${query.trim()}%`,
      ]);
    }
  }
  return parts;
}

function sameFilters(
  oldFilters: [string, string, string][],
  newFilters: [string, string, string][],
): boolean {
  if (newFilters.length === oldFilters.length) {
    for (let i = 0; i < newFilters.length; i++) {
      for (let j = 0; j < 3; j++) {
        if (newFilters[i][j] !== oldFilters[i][j]) {
          return false;
        }
      }
    }
    return true;
  }
  return false;
}

const excludedSearchAttrs: [string, string][] = [
  // Exclude computed fields
  ['$files', 'url'],
];

function SearchInput({
  onSearchChange,
  attrs,
  initialFilters = [],
}: {
  onSearchChange: (filters: SearchFilter[]) => void;
  attrs?: SchemaAttr[];
  initialFilters?: SearchFilter[];
}) {
  const [query, setQuery] = useState('');
  const lastFilters = useRef<SearchFilter[]>(initialFilters);

  const { attrsByName, stringIndexed } = useMemo(() => {
    const byName: { [key: string]: SchemaAttr } = {};
    const stringIndexed = [];
    for (const attr of attrs || []) {
      byName[attr.name] = attr;
      if (attr.isIndex && attr.checkedDataType === 'string') {
        stringIndexed.push(attr);
      }
    }
    return { attrsByName: byName, stringIndexed };
  }, [attrs]);

  const searchDebounce = useCallback(
    debounce((query) => {
      const filters = queryToFilters({ query, attrsByName, stringIndexed });
      if (!sameFilters(lastFilters.current, filters)) {
        lastFilters.current = filters;
        onSearchChange(filters);
      }
    }, 80),
    [attrsByName, stringIndexed, lastFilters],
  );

  const lastQuerySegment =
    query.indexOf(':') !== -1 ? last(query.split(' ')) : query;

  const comboOptions: { field: string; operator: string; display: string }[] = (
    attrs || []
  ).flatMap((a) => {
    const isExcluded = excludedSearchAttrs.some(
      ([ns, name]) => ns === a.namespace && name === a.name,
    );
    if (a.type === 'ref' || isExcluded) {
      return [];
    }

    const ops = [];

    const opCandidates = [];
    opCandidates.push({
      field: a.name,
      operator: ':',
      display: `${a.name}:`,
    });
    if (
      a.isIndex &&
      (a.checkedDataType === 'number' || a.checkedDataType === 'date')
    ) {
      const base = {
        field: a.name,
        query: null,
      };
      opCandidates.push({ ...base, operator: '<', display: `${a.name}<` });
      opCandidates.push({ ...base, operator: '>', display: `${a.name}>` });
    }

    for (const op of opCandidates) {
      if (
        !lastQuerySegment ||
        (op.display.startsWith(lastQuerySegment) &&
          op.display !== lastQuerySegment)
      ) {
        ops.push(op);
      }
    }
    return ops;
  });

  const activeOption = useRef<(typeof comboOptions)[0] | null>(null);

  function completeQuery(optionDisplay: string) {
    let q;
    if (lastQuerySegment && optionDisplay.startsWith(lastQuerySegment)) {
      q = `${query}${optionDisplay.substring(lastQuerySegment.length)}`;
    } else {
      q = `${query.trim()} ${optionDisplay}`;
    }
    setQuery(q);
    searchDebounce(q);
  }

  // Set initial search query based on filters
  useEffect(() => {
    if (initialFilters.length > 0 && !query) {
      // Simple conversion - this could be improved
      setQuery(initialFilters.map((f) => `${f[0]}:${f[2]}`).join(' '));
    }
  }, [initialFilters]);

  return (
    <Combobox
      value={query}
      onChange={(option) => {
        if (option) {
          completeQuery(option);
        }
      }}
      immediate={true}
    >
      <ComboboxInput
        size={32}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          searchDebounce(e.target.value);
        }}
        onKeyDown={(e) => {
          // Prevent the combobox's default action that inserts
          // the active option and tabs out of the input.
          // Inserting the option doesn't work in our case, because
          // it's just the start of a query, you still need to add
          // the value
          if (e.key === 'Tab' && comboOptions.length) {
            e.preventDefault();

            const active = activeOption.current || comboOptions[0];
            if (active) {
              completeQuery(active.display);
            }
          }
        }}
        placeholder="Filter..."
      />
      <ComboboxOptions
        anchor="bottom start"
        modal={false}
        className="mt-1 w-[var(--input-width)] overflow-auto rounded-md bg-white shadow-lg z-10 border border-gray-300 divide-y"
      >
        {comboOptions.map((o, i) => (
          <ComboboxOption
            key={i}
            value={o.display}
            className={clsx('px-3 py-1 data-[focus]:bg-blue-100', {})}
          >
            {({ focus }) => {
              if (focus) {
                activeOption.current = o;
              }
              return <span>{o.display}</span>;
            }}
          </ComboboxOption>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
}

export function Explorer({
  db,
  appId,
}: {
  db: InstantReactWebDatabase<any>;
  appId: string;
}) {
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
  const lastSelectedIdRef = useRef<string | null>(null);

  const [searchFilters, setSearchFilters] = useState<SearchFilter[]>([]);
  const [ignoreUrlChanges, setIgnoreUrlChanges] = useState(false);

  // nav
  const router = useRouter();
  const selectedNamespaceId = router.query.ns as string;
  const urlSearch = router.query.search as string;
  const urlWhere = router.query.where
    ? JSON.parse(router.query.where as string)
    : null;
  const urlLimit = parseInt(router.query.limit as string, 10) || 50;
  const urlPage = parseInt(router.query.page as string, 10) || 1;

  const [isNavigating, setIsNavigating] = useState(false);
  const [
    navStack,
    // don't call this directly, instead call `nav`
    _setNavStack,
  ] = useState<ExplorerNav[]>([]);
  const [checkedIds, setCheckedIds] = useState<Record<string, true>>({});
  const currentNav: ExplorerNav | undefined = navStack[navStack.length - 1];
  const showBackButton = navStack.length > 1;

  function nav(s: ExplorerNav[], options?: { replaceHistory?: boolean }) {
    setIsNavigating(true);
    _setNavStack(s);
    setCheckedIds({});

    const current = s[s.length - 1];
    const ns = current.namespace;

    // Build query params including both namespace and search filters
    const queryParams: any = {
      ...router.query,
      ns,
    };

    // Add where clause
    if (current.where) {
      queryParams.where = JSON.stringify(current.where);
    } else {
      delete queryParams.where;
    }

    // Add search filters
    if (current.filters && current.filters.length > 0) {
      queryParams.search = filtersToQueryString(current.filters);
    } else {
      delete queryParams.search;
    }

    // Add sort
    if (current.sortAttr) {
      queryParams.sort = current.sortAttr;
      queryParams.sortDir = current.sortAsc ? 'asc' : 'desc';
    } else {
      delete queryParams.sort;
      delete queryParams.sortDir;
    }

    // Add pagination
    if (current.limit) {
      queryParams.limit = current.limit;
    } else {
      delete queryParams.limit;
    }
    if (current.page) {
      queryParams.page = current.page;
    } else {
      delete queryParams.page;
    }

    // Set flag to ignore the next URL change since we're causing it
    setIgnoreUrlChanges(true);

    const navMethod = options?.replaceHistory ? router.replace : router.push;

    navMethod(
      {
        query: queryParams,
      },
      undefined,
      {
        // Don't scroll to top when navigating
        scroll: false,
      },
    ).then(() => {
      setTimeout(() => {
        setIsNavigating(false);
      }, 50);
    });
  }

  function replaceNavStackTop(_nav: Partial<ExplorerNav>) {
    const top = navStack[navStack.length - 1];

    if (!top) return;

    nav([...navStack.slice(0, -1), { ...top, ..._nav }], {
      replaceHistory: true,
    });
  }

  function pushNavStack(_nav: ExplorerNav) {
    const currentNamespace = navStack[navStack.length - 1]?.namespace;
    if (currentNamespace !== _nav.namespace) {
      // Reset search filters, offsets, and limit when changing namespaces
      setSearchFilters([]);
      setOffsets((prev) => ({
        ...prev,
        [_nav.namespace || '']: 0,
      }));
      setLimit(50);
    }

    nav([...navStack, _nav]);
  }

  function popNavStack() {
    // If we're just going back to the previous state in the nav stack,
    // use browser history instead of pushing a new state
    if (navStack.length > 1) {
      router.back();
    }
  }

  // data
  const { namespaces } = useSchemaQuery(db);
  const { selectedNamespace } = useMemo(
    () => ({
      selectedNamespace: namespaces?.find(
        (ns) => ns.id === currentNav?.namespace,
      ),
    }),
    [namespaces, currentNav?.namespace],
  );

  // Handle searchFilters changes to update the URL and navigation state
  useEffect(() => {
    if (currentNav && searchFilters.length > 0 && !ignoreUrlChanges) {
      replaceNavStackTop({ filters: searchFilters });
    } else if (
      searchFilters.length === 0 &&
      currentNav?.filters?.length &&
      !ignoreUrlChanges
    ) {
      replaceNavStackTop({ filters: [] });
    }
  }, [searchFilters]);

  // Handle browser navigation (back/forward buttons)
  useEffect(() => {
    if (ignoreUrlChanges) {
      // Reset the flag after the URL has changed
      setIgnoreUrlChanges(false);
      return;
    }

    // If we're currently navigating, ignore this effect
    if (isNavigating) {
      return;
    }

    if (namespaces && selectedNamespaceId && navStack.length > 0) {
      // If the URL namespace doesn't match the current nav stack namespace
      // or the search params have changed, update the nav stack
      const currentNav = navStack[navStack.length - 1];

      const changedNamespace = currentNav.namespace !== selectedNamespaceId;
      const parsedSearch =
        !changedNamespace && urlSearch
          ? parseFiltersFromQueryString(urlSearch)
          : [];
      const sortAttr = router.query.sort as string;
      const sortAsc = router.query.sortDir !== 'desc';

      const needsUpdate =
        changedNamespace ||
        JSON.stringify(currentNav.where || null) !==
          JSON.stringify(urlWhere || null) ||
        JSON.stringify(currentNav.filters || []) !==
          JSON.stringify(parsedSearch) ||
        currentNav.sortAttr !== sortAttr ||
        currentNav.sortAsc !== sortAsc;

      if (needsUpdate) {
        // Find the namespace in our list
        const targetNamespace = namespaces.find(
          (ns) => ns.id === selectedNamespaceId,
        );
        if (targetNamespace) {
          // Update the nav stack without triggering another router push
          _setNavStack([
            {
              namespace: selectedNamespaceId,
              where: urlWhere,
              filters: parsedSearch,
              sortAttr,
              sortAsc,
            },
          ]);

          // Also update the search filters state
          setSearchFilters(parsedSearch);

          // Reset checked items
          setCheckedIds({});
        }
      }
    }
  }, [
    selectedNamespaceId,
    urlWhere,
    urlSearch,
    router.query.sort,
    router.query.sortDir,
    namespaces,
  ]);

  // auth
  const token = useContext(TokenContext);

  const isSystemCatalogNs = selectedNamespace?.name?.startsWith('$') ?? false;
  const sanitizedNsName = selectedNamespace?.name ?? '';
  const readOnlyNs =
    isSystemCatalogNs && !['$users', '$files'].includes(sanitizedNsName);

  const [limit, setLimit] = useState(50);
  const [offsets, setOffsets] = useState<{ [namespace: string]: number }>({});

  const offset = offsets[sanitizedNsName] || 0;

  const sortAttr = currentNav?.sortAttr || 'serverCreatedAt';
  const sortAsc = currentNav?.sortAsc ?? true;

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

  const allItems = itemsRes.data?.[selectedNamespace?.name ?? ''] ?? [];

  const numPages = allCount ? Math.ceil(allCount / limit) : 1;
  const currentPage = offset / limit + 1;

  const userNamespaces = namespaces?.filter((x) => !x.name.startsWith('$'));

  // Handle initial load
  useEffect(() => {
    if (namespaces?.length && !navStack.length) {
      const userNamespaces = namespaces?.filter((x) => !x.name.startsWith('$'));

      // Parse search filters from URL if present
      const parsedSearch = urlSearch
        ? parseFiltersFromQueryString(urlSearch)
        : [];

      // Parse sort parameters
      const sortAttr = (router.query.sort as string) || 'serverCreatedAt';
      const sortAsc = router.query.sortDir !== 'desc';

      const namespace = selectedNamespaceId || userNamespaces?.[0]?.id;

      // Use _setNavStack directly to avoid triggering a router.push during initialization
      _setNavStack([
        {
          namespace,
          where: urlWhere,
          filters: parsedSearch,
          sortAttr,
          sortAsc,
        },
      ]);

      // Sync search, limits, and offsets with URL parameters
      setSearchFilters(parsedSearch);
      setLimit(urlLimit);
      setOffsets((prev) => ({
        ...prev,
        [namespace || '']: (urlPage - 1) * urlLimit,
      }));

      // Add namespace to URL if not already present
      if (!selectedNamespaceId) {
        const queryParams = { ...router.query, ns: namespace };
        // Replace URL without adding to history
        router.replace({ query: queryParams }, undefined, { shallow: true });
      }
    }
  }, [namespaces === null]);

  useClickOutside(nsRef, () => {
    setIsNsOpen(false);
  });

  const selectedEditableItem = useMemo(
    () => allItems.find((i) => i.id === editableRowId),
    [allItems.length, editableRowId],
  );
  const rowText =
    sanitizedNsName === '$files'
      ? Object.keys(checkedIds).length === 1
        ? 'file'
        : 'files'
      : Object.keys(checkedIds).length === 1
        ? 'row'
        : 'rows';

  // Storage

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleUploadFile = async () => {
    try {
      setUploadingFile(true);
      if (selectedFiles.length === 0) {
        return;
      }

      const [file] = selectedFiles;
      const success = await upload(token, appId, file, customPath);

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

  const handleRangeSelection = (currentId: string, checked: boolean) => {
    const allItemIds = allItems.map((i) => i.id as string);
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
                    await bulkDeleteFiles(token, appId, filenames);
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
      <Dialog open={Boolean(editNs)} onClose={() => setEditNs(null)}>
        {selectedNamespace ? (
          <EditNamespaceDialog
            readOnly={readOnlyNs}
            isSystemCatalogNs={isSystemCatalogNs}
            appId={appId}
            db={db}
            namespace={selectedNamespace}
            namespaces={namespaces ?? []}
            pushNavStack={pushNavStack}
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
          },
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
          <Bars3Icon height="1rem" />
        </button>
      </div>
      {selectedNamespace && currentNav && allItems ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center border-b overflow-hidden">
            <div className="flex flex-1 flex-col justify-between md:flex-row md:items-center">
              <div className="flex items-center border-b px-2 py-1 md:border-b-0 overflow-hidden">
                {showBackButton ? (
                  <ArrowLeftIcon
                    className="mr-4 inline cursor-pointer"
                    height="1rem"
                    onClick={popNavStack}
                  />
                ) : null}
                {currentNav?.where ? (
                  <XMarkIcon
                    className="mr-4 inline cursor-pointer"
                    height="1rem"
                    onClick={() => {
                      pushNavStack({
                        namespace: selectedNamespace.id,
                      });
                    }}
                  />
                ) : null}
                <div className="truncate overflow-hidden text-ellipses whitespace-nowrap font-mono text-xs flex-shrink">
                  <strong>{selectedNamespace.name}</strong>{' '}
                  {currentNav.where ? (
                    <>
                      {' '}
                      where <strong>{currentNav.where[0]}</strong> ={' '}
                      <em className="rounded-sm border bg-white px-1">
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
                          <em className="rounded-sm border bg-white px-1">
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
            <div className="flex py-2 px-2 gap-2">
              <div className="flex gap-2 w-full">
                <div className="flex gap-2 flex-shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="flex rounded-sm border border-zinc-200 bg-transparent px-1 py-1 text-sm shadow-sm transition-colors file:text-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
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
                  >
                    {uploadingFile ? 'Uploading...' : 'Upload file'}
                  </Button>
                </div>
                <div className="relative flex flex-1 max-w-[67vw] min-w-0">
                  <span className="absolute inset-y-0 left-0 flex items-center px-3 text-sm text-zinc-500 bg-gray-100 rounded-l-md ">
                    File Path:
                  </span>
                  <input
                    type="text"
                    placeholder="Enter a custom path (optional)"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    className="w-full h-9 rounded-md bg-transparent pl-24 pr-3 py-1 text-sm placeholder:text-zinc-500 outline outline-1 outline-zinc-200 focus:ring-2 focus:ring-blue-700 border-0"
                  />
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-start space-x-2 p-1 text-xs border-b">
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
                Add row
              </Button>
            ) : null}
            <div>
              <Select
                className="text-xs"
                onChange={(opt) => {
                  if (!opt) return;

                  const newLimit = parseInt(opt.value, 10);
                  setLimit(newLimit);
                  replaceNavStackTop({ limit: newLimit });
                }}
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
              onClick={() => {
                setOffsets({
                  ...offsets,
                  [selectedNamespace.name]: Math.max(0, offset - limit),
                });
                replaceNavStackTop({
                  page: Math.max(1, currentPage - 1),
                });
              }}
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
                      page === currentPage
                        ? 'bg-gray-200'
                        : 'hover:bg-gray-100',
                    )}
                    onClick={() => {
                      setOffsets({
                        ...offsets,
                        [selectedNamespace.name]: i * limit,
                      });
                      replaceNavStackTop({
                        page,
                      });
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
                replaceNavStackTop({
                  page: Math.min(numPages, currentPage + 1),
                });
              }}
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
            <table className="z-0 w-full flex-1 text-left font-mono text-xs text-gray-500">
              <thead className="sticky top-0 z-20 bg-white text-gray-700 shadow">
                <tr>
                  <th
                    colSpan={selectedNamespace.attrs.length + 1}
                    className={clsx(
                      'absolute top-0 right-0 left-[48px] z-30 flex items-center gap-1.5 overflow-hidden bg-white px-4 py-2',
                      {
                        hidden: !Object.keys(checkedIds).length,
                      },
                    )}
                  >
                    <Button
                      disabled={readOnlyNs}
                      title={
                        readOnlyNs
                          ? `The ${selectedNamespace?.name} namespace is read-only.`
                          : undefined
                      }
                      variant="destructive"
                      size="mini"
                      className="flex px-2 py-0 text-xs"
                      onClick={() => {
                        setDeleteDataConfirmationOpen(true);
                      }}
                    >
                      Delete {rowText}
                    </Button>
                  </th>
                </tr>
                <tr>
                  <th className="px-2 py-2" style={{ width: '48px' }}>
                    <Checkbox
                      checked={
                        allItems.length > 0 &&
                        Object.keys(checkedIds).length === allItems.length
                      }
                      onChange={(checked) => {
                        if (checked) {
                          setCheckedIds(
                            Object.fromEntries(
                              allItems.map((i) => [i.id, true]),
                            ),
                          );
                          // Use the first item as the last selected ID
                          if (allItems.length > 0) {
                            lastSelectedIdRef.current = allItems[0]
                              .id as string;
                          }
                        } else {
                          setCheckedIds({});
                          lastSelectedIdRef.current = null;
                        }
                      }}
                    />
                  </th>
                  {selectedNamespace.attrs.map((attr) => (
                    <th
                      key={attr.name}
                      className={clsx(
                        'z-10 select-none whitespace-nowrap px-4 py-1',
                        {
                          'bg-gray-200':
                            // Only highlight if one of the columns was clicked,
                            // not if we're just doing our default sort
                            currentNav?.sortAttr &&
                            (sortAttr === attr.name ||
                              (sortAttr === 'serverCreatedAt' &&
                                attr.name === 'id')),
                          'cursor-pointer': attr.sortable || attr.name === 'id',
                        },
                      )}
                      onClick={
                        attr.sortable
                          ? () => {
                              replaceNavStackTop({
                                sortAttr: attr.name,
                                sortAsc:
                                  sortAttr !== attr.name ? true : !sortAsc,
                              });
                            }
                          : attr.name === 'id'
                            ? () => {
                                replaceNavStackTop({
                                  sortAttr: 'serverCreatedAt',
                                  sortAsc:
                                    sortAttr !== 'serverCreatedAt'
                                      ? true
                                      : !sortAsc,
                                });
                              }
                            : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        {selectedNamespace.name === '$files' &&
                        attr.name === 'url'
                          ? ''
                          : attr.name}
                        {attr.sortable || attr.name === 'id' ? (
                          <span>
                            {sortAttr === attr.name ||
                            (sortAttr === 'serverCreatedAt' &&
                              attr.name === 'id') ? (
                              sortAsc ? (
                                '↑'
                              ) : (
                                '↓'
                              )
                            ) : (
                              <span className="text-gray-400">↓</span>
                            )}
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {allItems.map((item) => (
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
                        onChange={(checked, e) => {
                          const isShiftPressed = e.nativeEvent
                            ? (e.nativeEvent as MouseEvent).shiftKey
                            : false;

                          if (isShiftPressed && lastSelectedIdRef.current) {
                            handleRangeSelection(item.id as string, checked);
                          } else {
                            // Regular single click selection
                            setCheckedIds((prev) => {
                              const newCheckedIds = { ...prev };
                              if (checked) {
                                newCheckedIds[item.id as string] = true;
                              } else {
                                delete newCheckedIds[item.id as string];
                              }
                              return newCheckedIds;
                            });
                          }

                          // Updated last selected for proper range selection
                          // in future operations
                          lastSelectedIdRef.current = item.id as string;
                        }}
                      />
                      {readOnlyNs ? null : (
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setEditableRowId(item.id)}
                        >
                          <PencilSquareIcon className="h-4 w-4 text-gray-500" />
                        </button>
                      )}
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
                        {selectedNamespace.name === '$files' &&
                        attr.name === 'url' ? (
                          <Button
                            variant="secondary"
                            size="mini"
                            onClick={() => {
                              window.open(item.url as string, '_blank');
                            }}
                          >
                            View File
                          </Button>
                        ) : (
                          <ExplorerItemVal
                            item={item}
                            attr={attr}
                            onClickLink={() => {
                              const linkConfigDir =
                                attr.linkConfig[
                                  !attr.isForward ? 'forward' : 'reverse'
                                ];
                              if (linkConfigDir) {
                                pushNavStack({
                                  namespace: linkConfigDir.namespace,
                                  where: [`${linkConfigDir.attr}.id`, item.id],
                                });
                              }
                            }}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="h-full"></tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : userNamespaces?.length ? (
        <div className="px-4 py-2 text-sm italic text-gray-500">
          Select a namespace
        </div>
      ) : userNamespaces?.length === 0 ? (
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

function getExplorerItemVal(item: Record<string, any>, attr: SchemaAttr) {
  if (attr.namespace === '$files' && attr.name === 'size') {
    return formatBytes(item.size);
  }

  return (item as any)[attr.name];
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
  const val = getExplorerItemVal(item, attr);

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
  db: InstantReactWebDatabase<any>;
  onClose: (p?: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState('');

  async function onSubmit() {
    const idAttr: DBAttr = {
      id: id(),
      'forward-identity': [id(), name, 'id'],
      'value-type': 'blob',
      cardinality: 'one',
      'unique?': true,
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

export interface ExplorerNav {
  namespace?: string;
  where?: [string, any];
  sortAttr?: string;
  sortAsc?: boolean;
  filters?: SearchFilter[];
  limit?: number;
  page?: number;
}

export type PushNavStack = (nav: ExplorerNav) => void;

// DEV

function _dev(db: InstantReactWebDatabase<any>) {
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

// Storage

async function upload(
  token: string,
  appId: string,
  file: File,
  customFilename: string,
): Promise<boolean> {
  const headers = {
    app_id: appId,
    path: customFilename || file.name,
    authorization: `Bearer ${token}`,
    'content-type': file.type,
  };

  const data = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/storage/upload`,
    {
      method: 'PUT',
      headers,
      body: file,
    },
  );

  return data;
}

async function bulkDeleteFiles(
  token: string,
  appId: string,
  filenames: string[],
): Promise<any> {
  const { data } = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/storage/files/delete`,
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
