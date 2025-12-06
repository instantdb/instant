import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { SearchFilter } from '@lib/hooks/explorer';
import { SchemaAttr } from '@lib/types';
import { debounce, last } from 'lodash';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '../ui';

const excludedSearchAttrs: [string, string][] = [
  // Exclude computed fields
  ['$files', 'url'],
];
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

export function SearchInput({
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
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
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
        className="z-10 mt-1 w-(--input-width) divide-y overflow-auto rounded-md border border-neutral-300 bg-white shadow-lg dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800"
      >
        {comboOptions.map((o, i) => (
          <ComboboxOption
            key={i}
            value={o.display}
            className={cn(
              'px-3 py-1 data-focus:bg-blue-100 dark:text-white dark:data-focus:bg-neutral-700',
              {},
            )}
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
