import { id, InstantReactWebDatabase, tx } from '@instantdb/react';
import { useMemo, useRef, useState } from 'react';

import {
  ActionButton,
  ActionForm,
  Button,
  CodeEditor,
  Label,
  Select,
  Checkbox,
} from '@/components/ui';
import { SchemaAttr, SchemaNamespace, SchemaNamespaceMap } from '@/lib/types';
import { errorToast, successToast } from '@/lib/toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import {
  ArrowUturnLeftIcon,
  ArrowPathIcon,
  Cog8ToothIcon,
  TrashIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid';
import { validate } from 'uuid';
import clsx from 'clsx';
import { ClockIcon } from '@heroicons/react/24/outline';

type FieldType = 'string' | 'number' | 'boolean' | 'json';
type FieldTypeOption = { value: FieldType; label: string };

const fieldTypeOptions: FieldTypeOption[] = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'json', label: 'json' },
];

const defaultValueByType: Record<FieldType, any> = {
  string: '',
  number: 0,
  boolean: false,
  json: {},
};

function validFieldTypeOptions(checkedDataType?: string): FieldTypeOption[] {
  if (!checkedDataType) {
    return fieldTypeOptions;
  }

  if (checkedDataType === 'date') {
    return fieldTypeOptions.filter(
      (opt) => opt.value === 'string' || opt.value === 'number',
    );
  }

  return fieldTypeOptions.filter((opt) => opt.value === checkedDataType);
}

// returns true if value is an object or array (but not null)
const isJsonObject = (value: any) => !!value && typeof value === 'object';

function isValidJson(value: any) {
  try {
    JSON.parse(value);
    return true;
  } catch (e) {
    return false;
  }
}

function tryJsonParse(value: any) {
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

function getAppropriateFieldType(attr: SchemaAttr, value: any): FieldType {
  // Use the checkedDatatype if it's set
  if (attr.checkedDataType) {
    if (attr.checkedDataType === 'date') {
      return 'string';
    }
    return attr.checkedDataType;
  }

  if (value != null) {
    // if object or array, label as "json" for now
    const t = isJsonObject(value) ? 'json' : typeof value;
    // defaults to 'string' type (fieldTypeOptions[0])
    const option = fieldTypeOptions.find((opt) => opt.value === t);

    if (option) {
      return option.value;
    }
  }

  // For nulls we guess the based on what we could infer from previous values
  // for this attribute
  if (attr.inferredTypes?.length) {
    return attr.inferredTypes[0];
  }

  // Fallback to the first option
  return fieldTypeOptions[0].value;
}

function parseFieldValue(value: any, type: FieldType) {
  // Preserve null regardless of type
  if (value === null) {
    return null;
  }

  if (type === 'number') {
    const cleaned = String(value).replace(/[^\d.-]/g, '');
    if (
      cleaned === '' ||
      cleaned === '-' ||
      cleaned === '.' ||
      cleaned === '-.'
    ) {
      return cleaned;
    }
    const match = cleaned.match(/^(-?\d*\.?\d*)\.?$/);
    return match ? Number(match[0]) : '';
  } else if (type === 'boolean') {
    return value === 'true';
  } else if (type === 'string') {
    return isJsonObject(value) ? JSON.stringify(value) : String(value);
  } else if (type === 'json') {
    return tryJsonParse(value);
  }

  return value;
}

function uuidValidate(uuid: string): string | null {
  return validate(uuid) ? null : 'Invalid UUID.';
}

function RefItemTooltip({
  db,
  namespace,
  item,
}: {
  db: InstantReactWebDatabase<any>;
  namespace: SchemaNamespaceMap;
  item: Record<string, any>;
}) {
  const [open, setOpen] = useState(false);
  const [loadObject, setLoadObject] = useState(false);

  const { data, isLoading } = db.useQuery(
    open || loadObject
      ? { [namespace.name]: { $: { where: { id: item.id } } } }
      : null,
  );

  return (
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={0} open={open}>
        <Tooltip.Trigger
          asChild={true}
          onMouseEnter={() => setLoadObject(true)}
          onTouchStart={() => setLoadObject(true)}
        >
          <span>
            <Button
              size="mini"
              variant="subtle"
              onClick={() => setOpen((v) => !v)}
            >
              <InformationCircleIcon height={14} />
            </Button>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content collisionPadding={10} side="bottom">
          <div className="relative">
            <div
              className="max-w-md overflow-auto whitespace-pre border bg-white bg-opacity-90 p-2 font-mono text-xs shadow-md backdrop-blur-sm"
              style={{
                maxHeight: `var(--radix-popper-available-height)`,
              }}
            >
              {JSON.stringify(data?.[namespace.name]?.[0] || item, null, 2)}
            </div>
            {isLoading ? (
              <div className="animate-spin absolute top-0 right-0 p-2 opacity-50">
                <Cog8ToothIcon width={12} />
              </div>
            ) : null}
          </div>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function LinkComboboxItem({
  q,
  option,
  uniqueAttrs,
  filterableAttrs,
}: {
  q: string;
  option: any;
  uniqueAttrs: SchemaAttr[];
  filterableAttrs: SchemaAttr[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <ComboboxOption
      key={option.id}
      value={option}
      className={clsx('px-3 py-1 data-[focus]:bg-blue-100 cursor-pointer', {})}
    >
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={0} open={open}>
          <Tooltip.Trigger
            asChild={true}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            <div>
              <div>
                <code>{option.id}</code>
              </div>
              <div className="truncate">
                {filterableAttrs
                  .filter(
                    (a) =>
                      option.hasOwnProperty(a.name) &&
                      !a.isUniq &&
                      q &&
                      JSON.stringify(option[a.name])
                        .toLowerCase()
                        .indexOf(q.toLowerCase()) !== -1,
                  )
                  .slice(0, 3)
                  .map((a) => (
                    <div key={a.id}>
                      <span className="font-medium">{a.name}</span>:{' '}
                      {JSON.stringify(option[a.name])}
                    </div>
                  ))}
                {uniqueAttrs
                  .filter((a) => option.hasOwnProperty(a.name))
                  .slice(0, 3)
                  .map((a) => (
                    <div key={a.id}>
                      <span className="font-medium">{a.name}</span>:{' '}
                      {JSON.stringify(option[a.name])}
                    </div>
                  ))}
              </div>
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content collisionPadding={10}>
            <div
              className="overflow-auto max-w-md whitespace-pre border bg-white bg-opacity-90 p-2 font-mono text-xs shadow-md backdrop-blur-sm"
              style={{
                maxHeight: `var(--radix-popper-available-height)`,
              }}
            >
              {JSON.stringify(option, null, 2)}
            </div>
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </ComboboxOption>
  );
}

function LinkCombobox({
  db,
  namespace,
  onLinkRef,
  ignoreIds,
  onClose,
}: {
  db: InstantReactWebDatabase<any>;
  namespace: SchemaNamespaceMap;
  onLinkRef: (item: any) => void;
  ignoreIds: Set<string>;
  onClose: () => void;
}) {
  const [q, setq] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  const { uniqueAttrs, filterableAttrs } = useMemo(() => {
    const uniqueAttrs: SchemaAttr[] = [];
    const filterableAttrs: SchemaAttr[] = [];
    for (const [_k, attr] of Object.entries(namespace.attrs)) {
      if (attr.isUniq && attr.name !== 'id' && attr.type === 'blob') {
        uniqueAttrs.push(attr);
      }
      if (
        attr.isIndex &&
        (attr.checkedDataType === 'string' || attr.checkedDataType === 'number')
      ) {
        filterableAttrs.push(attr);
      }
    }
    return { uniqueAttrs, filterableAttrs };
  }, [namespace.attrs]);

  const query = useMemo(() => {
    const clauses: any[] = [{ $entityIdStartsWith: q }];
    let numVal;
    try {
      const num = JSON.parse(q);
      if (typeof num === 'number') {
        numVal = num;
      }
    } catch (e) {}

    for (const attr of filterableAttrs) {
      if (attr.checkedDataType === 'string' && q.trim()) {
        clauses.push({ [attr.name]: { $ilike: `%${q.trim()}%` } });
      }
      if (attr.checkedDataType === 'number' && numVal != null) {
        clauses.push({ [attr.name]: numVal });
      }
    }
    for (const attr of uniqueAttrs) {
      if (!attr.checkedDataType) {
        clauses.push({ [attr.name]: q });
        if (numVal != null) {
          clauses.push({ [attr.name]: numVal });
        }
      }
    }
    return {
      [namespace.name]: {
        $: {
          where: {
            or: clauses,
          },
          limit: 20,
        },
      },
    };
  }, [namespace.name, filterableAttrs, q]);

  const { data, isLoading } = db.useQuery(query);

  const options = data?.[namespace.name]?.filter((o) => !ignoreIds.has(o.id));

  return (
    <div className="w-full mt-1">
      <Combobox
        key={isLoading ? 'query-loading' : 'query-loaded'}
        onChange={(option: any) => {
          if (option) {
            onLinkRef(option);
            setq('');
            onClose();
          }
        }}
        onClose={onClose}
        immediate={true}
      >
        <ComboboxInput
          ref={inputRef}
          autoFocus={true}
          size={32}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={q}
          onChange={(e) => {
            setq(e.target.value);
          }}
          placeholder={`Search ${namespace.name}...`}
        />

        <ComboboxOptions
          portal={false}
          unmount={false}
          static={true}
          className="fixed max-h-[25vh] mt-1 w-[var(--input-width)] overflow-scroll rounded-md bg-white shadow-lg border border-gray-300 divide-y empty:invisible"
          style={{ top: inputRef.current?.getBoundingClientRect().bottom }}
        >
          {(options || []).map((o) => (
            <LinkComboboxItem
              key={o.id}
              q={q}
              option={o}
              uniqueAttrs={uniqueAttrs}
              filterableAttrs={filterableAttrs}
            />
          ))}
        </ComboboxOptions>
        {options?.length || isLoading ? null : (
          <div className="absolute p-2 mt-1 w-[var(--input-width)] overflow-scroll rounded-md bg-white shadow-lg border border-gray-300 divide-y">
            No matching rows in <code>{namespace.name}</code>
          </div>
        )}
      </Combobox>
    </div>
  );
}

function RefItem({
  db,
  item,
  attr,
  namespace,
  refUpdates,
  handleLinkRef,
  handleUnlinkRef,
}: {
  db: InstantReactWebDatabase<any>;
  item: Record<string, any>;
  attr: SchemaAttr;
  namespace: SchemaNamespaceMap;
  refUpdates: null | Record<string, { action: 'link' | 'unlink'; item: any }>;
  handleLinkRef: (attr: SchemaAttr, item: any) => void;
  handleUnlinkRef: (attr: SchemaAttr, id: string) => void;
}) {
  const [showAddLink, setShowAddLink] = useState(false);
  const searchIgnoreIds = useMemo(() => {
    const res: Set<string> = new Set();
    for (const [k] of Object.entries(refUpdates || {})) {
      res.add(k);
    }
    for (const linkItem of item[attr.name] || []) {
      res.add(linkItem.id);
    }
    return res;
  }, [item[attr.name], refUpdates]);

  const cardinality = attr.cardinality;
  const hasLink = item[attr.name]?.length > 0;

  return (
    <>
      {item[attr.name]?.map((x: any) => {
        const markedForUnlink = refUpdates?.[x.id]?.action === 'unlink';
        return (
          <div key={x.id}>
            <code className={markedForUnlink ? 'line-through' : ''}>
              {x.id}
            </code>
            <RefItemTooltip db={db} namespace={namespace} item={x} />
            <Button
              title={markedForUnlink ? 'Undo' : 'Unlink'}
              type="link"
              size="mini"
              variant={markedForUnlink ? 'subtle' : 'destructive'}
              className="border-none"
              onClick={() =>
                markedForUnlink
                  ? handleLinkRef(attr, x)
                  : handleUnlinkRef(attr, x.id)
              }
            >
              {markedForUnlink ? (
                <ArrowUturnLeftIcon height={14} />
              ) : (
                <TrashIcon height={14} />
              )}
            </Button>
          </div>
        );
      })}
      {Object.entries(refUpdates || {}).map(([id, { action, item }]) => {
        if (action !== 'link') {
          return;
        }

        return (
          <div key={id}>
            <code>{id}</code>
            <RefItemTooltip db={db} namespace={namespace} item={item} />
            <Button
              title={'Remove'}
              type="link"
              size="mini"
              variant={'destructive'}
              className="border-none"
              onClick={() => handleUnlinkRef(attr, id)}
            >
              <TrashIcon height={14} />
            </Button>
          </div>
        );
      })}
      {showAddLink ? (
        <LinkCombobox
          namespace={namespace}
          onLinkRef={(item) => handleLinkRef(attr, item)}
          db={db}
          ignoreIds={searchIgnoreIds}
          onClose={() => setShowAddLink(false)}
        />
      ) : (
        <Button variant="secondary" onClick={() => setShowAddLink(true)}>
          {cardinality === 'many' || !hasLink ? 'Add link' : 'Replace link'}
        </Button>
      )}
    </>
  );
}

const isEditableBlobAttr = (namespace: SchemaNamespace, attr: SchemaAttr) => {
  return (
    (attr.type === 'blob' && namespace.name !== '$files') ||
    (namespace.name === '$files' &&
      attr.type === 'blob' &&
      attr.name === 'path')
  );
};

export function EditRowDialog({
  db,
  namespace,
  item,
  onClose,
}: {
  db: InstantReactWebDatabase<any>;
  namespace: SchemaNamespace;
  item: Record<string, any>;
  onClose: () => void;
}) {
  const op: 'edit' | 'add' = item.id ? 'edit' : 'add';

  const editableBlobAttrs: SchemaAttr[] = [];
  const editableRefAttrs: SchemaAttr[] = [];

  for (const a of namespace.attrs) {
    if (a.name !== 'id') {
      if (isEditableBlobAttr(namespace, a)) {
        editableBlobAttrs.push(a);
      }
      if (a.type === 'ref') {
        editableRefAttrs.push(a);
      }
    }
  }

  const currentBlobs = editableBlobAttrs.reduce(
    (acc, attr) => {
      const val = item[attr.name];
      const t = getAppropriateFieldType(attr, val);

      const defaultValue =
        op === 'add' ? (attr.isRequired ? defaultValueByType[t] : null) : val;

      return {
        ...acc,
        [attr.name]: {
          type: t,
          value: defaultValue,
          error: null,
        },
      };
    },
    {} as Record<string, { type: FieldType; value: any; error: string | null }>,
  );

  const [blobUpdates, setUpdatedBlobValues] = useState<Record<string, any>>({
    ...currentBlobs,
    ...(op === 'add' ? { id: { type: 'string', value: id() } } : {}),
  });

  const [refUpdates, setRefUpdates] = useState<
    // Map of attr-name -> id -> add or remove
    Record<string, Record<string, { item: any; action: 'link' | 'unlink' }>>
  >({});

  const [jsonUpdates, setJsonUpdates] = useState<Record<string, any>>({});
  const [nullFields, setNullFields] = useState<Record<string, boolean>>(
    editableBlobAttrs.reduce((acc, attr) => {
      // Don't set nullFields for new rows
      return {
        ...acc,
        [attr.name]:
          op === 'edit'
            ? item[attr.name] === null || item[attr.name] === undefined
            : blobUpdates[attr.name].value === null,
      };
    }, {}),
  );

  const hasFormErrors = Object.values(blobUpdates).some((u) => !!u.error);
  const [shouldDisplayErrors, setShouldDisplayErrors] = useState(false);

  const handleResetForm = () => {
    setRefUpdates({});

    // Reset the blobUpdates to the original values
    setUpdatedBlobValues({ ...currentBlobs });

    // Reset the nullFields state based on the original item
    setNullFields(
      editableBlobAttrs.reduce((acc, attr) => {
        return {
          ...acc,
          [attr.name]:
            op === 'edit'
              ? item[attr.name] === null || item[attr.name] === undefined
              : false,
        };
      }, {}),
    );

    // Also reset any JSON updates to match the original values
    const resetJsonUpdates: Record<string, any> = {};
    editableBlobAttrs.forEach((attr) => {
      if (
        currentBlobs[attr.name]?.type === 'json' &&
        item[attr.name] !== undefined
      ) {
        resetJsonUpdates[attr.name] =
          item[attr.name] === null
            ? 'null'
            : JSON.stringify(item[attr.name], null, 2);
      }
    });
    setJsonUpdates(resetJsonUpdates);

    // Reset shouldDisplayErrors to clean state
    setShouldDisplayErrors(false);
  };

  const handleChangeFieldType = (field: string, type: FieldType) => {
    setUpdatedBlobValues((prev) => {
      const value = prev[field]?.value;

      return {
        ...prev,
        [field]: { type, value: parseFieldValue(value, type) },
      };
    });
  };

  const handleUpdateFieldValue = (
    field: string,
    value: any,
    validate?: (value: any) => string | null,
  ) => {
    const error = validate ? validate(value) : null;
    setUpdatedBlobValues((prev) => {
      const type = prev[field]?.type || 'string';

      return {
        ...prev,
        [field]: {
          type,
          value: parseFieldValue(value, type),
          error,
        },
      };
    });
  };

  const handleUpdateJson = (field: string, value: any) => {
    setJsonUpdates((prev) => ({ ...prev, [field]: value }));

    setUpdatedBlobValues((prev) => {
      const current = prev[field] || {};

      return {
        ...prev,
        [field]: isValidJson(value)
          ? { type: 'json', value: JSON.parse(value), error: null }
          : { ...current, type: 'json', error: 'Invalid JSON' },
      };
    });
  };

  const handleNullToggle = (field: string, checked: boolean) => {
    setNullFields((prev) => ({ ...prev, [field]: checked }));
    const currentType = blobUpdates[field]?.type || 'string';

    if (checked) {
      setUpdatedBlobValues((prev) => ({
        ...prev,
        [field]: {
          type: currentType,
          value: null, // set field to null
          error: null,
        },
      }));

      if (currentType === 'json') {
        setJsonUpdates((prev) => ({ ...prev, [field]: 'null' }));
      }
    } else {
      setUpdatedBlobValues((prev) => ({
        ...prev,
        [field]: {
          type: currentType,
          value: defaultValueByType[currentType as FieldType], // set to default
          error: null,
        },
      }));

      if (currentType === 'json') {
        setJsonUpdates((prev) => ({ ...prev, [field]: '{}' }));
      }
    }
  };

  const handleUnlinkRef = (attr: SchemaAttr, id: string) => {
    setRefUpdates((v) => {
      const existing = item[attr.name]?.find((x: any) => x.id === id);
      if (existing) {
        return {
          ...v,
          [attr.name]: {
            ...(v[attr.name] || {}),
            [id]: { action: 'unlink', item: null },
          },
        };
      }
      const { [id]: _, ...withoutId } = v[attr.name] || {};

      return {
        ...v,
        [attr.name]: withoutId,
      };
    });
  };

  const handleLinkRef = (attr: SchemaAttr, linkItem: any) => {
    setRefUpdates((v) => {
      const id = linkItem.id;
      const existing = v[attr.name]?.[id];
      // This is a undo
      if (existing && existing.action === 'unlink') {
        if (attr.cardinality === 'one') {
          const { [attr.name]: _, ...rest } = v;
          return rest;
        }
        const { [id]: _, ...withoutId } = v[attr.name];
        return {
          ...v,
          [attr.name]: withoutId,
        };
      }

      // Replace an existing link
      // Need to unlink the old one
      if (attr.cardinality === 'one' && item[attr.name]?.length) {
        const existingLink = item[attr.name][0];
        return {
          ...v,
          [attr.name]: {
            [id]: { action: 'link', item: linkItem },
            [existingLink.id]: { action: 'unlink', item: null },
          },
        };
      }

      // Add a new link
      return {
        ...v,
        [attr.name]: {
          ...(v[attr.name] || {}),
          [id]: { action: 'link', item: linkItem },
        },
      };
    });
  };

  const focusElementAtTabIndex = (index: number) => {
    // Use requestAnimationFrame to wait for the next render cycle
    // so that the input is shown to focus
    requestAnimationFrame(() => {
      const element = document.querySelector(`[tabindex="${index}"]`);
      if (element && element instanceof HTMLElement) {
        element.focus();
      }
    });
  };

  const handleSaveRow = async () => {
    if (hasFormErrors) {
      setShouldDisplayErrors(true);
      return;
    }

    const params = Object.fromEntries(
      Object.entries(blobUpdates).map(([field, { value }]) => {
        return [field, value];
      }),
    );
    const itemId = item.id || params.id || id();
    delete params.id;
    try {
      let chunks = tx[namespace.name][itemId];
      const unlinks = [];
      const links = [];
      for (const [attrName, v] of Object.entries(refUpdates)) {
        for (const [id, { action }] of Object.entries(v)) {
          if (action === 'link') {
            links.push({ [attrName]: id });
          }
          if (action === 'unlink') {
            unlinks.push({ [attrName]: id });
          }
        }
      }

      // Do unlinks first
      for (const unlink of unlinks) {
        chunks = chunks.unlink(unlink);
      }
      chunks = chunks.update(params);
      for (const link of links) {
        chunks = chunks.link(link);
      }

      await db.transact(chunks);

      onClose();
      successToast('Successfully updated row!');
    } catch (e: any) {
      const message = e.message;
      if (message) {
        errorToast(`Failed to save row: ${message}`);
      } else {
        throw e;
      }
    }
  };

  return (
    <ActionForm className="p-4">
      <h5 className="flex text-lg font-bold">
        {op == 'edit' ? 'Edit row' : 'Add row'}
      </h5>
      <code className="text-sm font-medium font-mono text-gray-500">
        {op == 'edit' ? (
          <>
            {namespace.name}['{item.id}']
          </>
        ) : (
          <>{namespace.name}</>
        )}
      </code>
      <div className="flex flex-col gap-4 mt-4">
        {op === 'add' ? (
          <div key="id" className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Label className="font-mono">
                <div className="flex gap-1">
                  id{' '}
                  <Button
                    type="link"
                    size="mini"
                    variant="subtle"
                    onClick={() => handleUpdateFieldValue('id', id())}
                  >
                    <ArrowPathIcon height={14} />
                  </Button>
                </div>
              </Label>
            </div>
            <div className="flex gap-1 flex-col">
              <input
                className="flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400"
                value={blobUpdates.id?.value ?? ''}
                onChange={(e) =>
                  handleUpdateFieldValue('id', e.target.value, uuidValidate)
                }
              />
            </div>{' '}
            {blobUpdates.id?.error && shouldDisplayErrors && (
              <span className="text-sm text-red-500 font-medium">
                {blobUpdates.id.error}
              </span>
            )}
          </div>
        ) : null}

        {editableBlobAttrs.map((attr, i) => {
          const tabIndex = i + 1;
          const { type, value, error } = blobUpdates[attr.name] || {
            type: 'string',
            value: defaultValueByType['string'],
          };
          const json =
            jsonUpdates[attr.name] ||
            (value !== null ? JSON.stringify(value, null, 2) : 'null');
          const isNullField = nullFields[attr.name];

          return (
            <div key={attr.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Label className="font-mono">{attr.name}</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <Checkbox
                      checked={isNullField}
                      onChange={(checked) =>
                        handleNullToggle(attr.name, checked)
                      }
                      label={
                        <span className="text-[10px] text-gray-600 uppercase">
                          null
                        </span>
                      }
                    />
                  </div>
                  <Select
                    className="w-24 rounded text-sm py-0.5 px-2"
                    value={type}
                    options={validFieldTypeOptions(attr.checkedDataType)}
                    onChange={(option) =>
                      handleChangeFieldType(
                        attr.name,
                        option!.value as FieldType,
                      )
                    }
                  />
                </div>
              </div>
              <div className="flex gap-1 flex-col">
                {!isNullField ? (
                  <div className="flex space-x-1">
                    <div className="flex-1">
                      {type === 'json' ? (
                        <div className="h-32 border rounded w-full">
                          <CodeEditor
                            tabIndex={tabIndex}
                            language="json"
                            value={json}
                            onChange={(code) =>
                              handleUpdateJson(attr.name, code)
                            }
                          />
                        </div>
                      ) : type === 'boolean' ? (
                        <Select
                          tabIndex={tabIndex}
                          value={value}
                          options={[
                            { value: 'false', label: 'false' },
                            { value: 'true', label: 'true' },
                          ]}
                          onChange={(option) =>
                            handleUpdateFieldValue(attr.name, option!.value)
                          }
                        />
                      ) : type === 'number' ? (
                        <input
                          tabIndex={tabIndex}
                          type="number"
                          className="flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400"
                          value={value ?? ''}
                          onChange={(num) =>
                            handleUpdateFieldValue(attr.name, num.target.value)
                          }
                        />
                      ) : (
                        <input
                          tabIndex={tabIndex}
                          className="flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400"
                          value={value ?? ''}
                          onChange={(e) =>
                            handleUpdateFieldValue(attr.name, e.target.value)
                          }
                        />
                      )}
                    </div>
                    {attr.checkedDataType === 'date' && (
                      <Button
                        variant="subtle"
                        size="mini"
                        className="border"
                        onClick={() => {
                          handleUpdateFieldValue(
                            attr.name,
                            type === 'number'
                              ? Date.now()
                              : new Date().toISOString(),
                          );
                        }}
                      >
                        <ClockIcon height={14} />
                        now
                      </Button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      handleNullToggle(attr.name, false);
                      focusElementAtTabIndex(tabIndex);
                    }}
                    className="flex-1 text-left rounded-sm border border-gray-200 bg-gray-50 px-3 py-1 text-gray-500 italic"
                  >
                    null
                  </button>
                )}
                {error && shouldDisplayErrors && (
                  <span className="text-sm text-red-500 font-medium">
                    {error}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {editableRefAttrs.map((attr, i) => {
          const namespace = attr.isForward
            ? attr.linkConfig.reverse!.nsMap
            : attr.linkConfig.forward.nsMap;

          if (!namespace) {
            // Sometimes we get links to namespaces that don't exist
            return null;
          }

          return (
            <div key={attr.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Label className="font-mono">{attr.name}</Label>
                <span className="rounded text-sm py-0.5 px-2">
                  Link to <code>{namespace.name}</code>
                </span>
              </div>
              <div className="flex gap-1 flex-col">
                <RefItem
                  db={db}
                  item={item}
                  namespace={namespace}
                  attr={attr}
                  refUpdates={refUpdates[attr.name]}
                  handleLinkRef={handleLinkRef}
                  handleUnlinkRef={handleUnlinkRef}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 flex flex-row items-center justify-between gap-1">
        {shouldDisplayErrors && hasFormErrors ? (
          <span className="text-red-500 text-sm font-medium">
            Failed to save. Please check above for errors.
          </span>
        ) : (
          <span />
        )}
        <div className="flex flex-row items-center gap-1">
          <Button type="button" variant="secondary" onClick={handleResetForm}>
            Reset
          </Button>
          <ActionButton
            tabIndex={editableBlobAttrs.length + 1}
            type="submit"
            variant="primary"
            label="Save"
            submitLabel="Saving..."
            errorMessage="Failed to save row."
            onClick={handleSaveRow}
          />
        </div>
      </div>
    </ActionForm>
  );
}
