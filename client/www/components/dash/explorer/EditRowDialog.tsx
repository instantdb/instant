import { id, InstantReactWeb, tx } from '@instantdb/react';
import { useState } from 'react';

import {
  ActionButton,
  ActionForm,
  Button,
  CodeEditor,
  Label,
  Select,
} from '@/components/ui';
import { SchemaNamespace } from '@/lib/types';
import { successToast } from '@/lib/toast';

type FieldType = 'string' | 'number' | 'boolean' | 'json';
type FieldTypeOption = { value: FieldType; label: string };

const fieldTypeOptions: FieldTypeOption[] = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'json', label: 'json' },
];

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

function getAppropriateFieldType(value: any): FieldType {
  // if object or array, label as "json" for now
  const t = isJsonObject(value) ? 'json' : typeof value;
  // defaults to 'string' type (fieldTypeOptions[0])
  const option =
    fieldTypeOptions.find((opt) => opt.value === t) || fieldTypeOptions[0];

  return option.value;
}

// For now, since all values are stored as type "blob", we try
// to parse the field value based on the provided field type
function parseFieldValue(value: any, type: FieldType) {
  if (type === 'number') {
    const sanitized = String(value).replace(/\D+/g, '').trim();

    return sanitized.length > 0 ? Number(sanitized) : sanitized;
  } else if (type === 'boolean') {
    return value === 'true';
  } else if (type === 'string') {
    return isJsonObject(value) ? JSON.stringify(value) : String(value);
  } else if (type === 'json') {
    return tryJsonParse(value);
  }

  return value;
}

export function EditRowDialog({
  db,
  namespace,
  item,
  onClose,
}: {
  db: InstantReactWeb;
  namespace: SchemaNamespace;
  item: Record<string, any>;
  onClose: () => void;
}) {
  const editableFieldNames = namespace.attrs
    // ignore the primary "id" field and any "ref" attributes
    .filter((a) => a.name !== 'id' && a.type === 'blob')
    .map((a) => a.name);

  const current = editableFieldNames.reduce((acc, field) => {
    const val = item[field];
    const t = getAppropriateFieldType(val);

    return { ...acc, [field]: { type: t, value: val, error: null } };
  }, {} as Record<string, { type: FieldType; value: any; error: string | null }>);

  const [updates, setUpdatedValues] = useState<Record<string, any>>({
    ...current,
  });
  const [jsonUpdates, setJsonUpdates] = useState<Record<string, any>>({});
  const hasFormErrors = Object.values(updates).some((u) => !!u.error);
  const [shouldDisplayErrors, setShouldDisplayErrors] = useState(false);

  const handleResetForm = () => setUpdatedValues({ ...current });

  const handleChangeFieldType = (field: string, type: FieldType) => {
    setUpdatedValues((prev) => {
      const value = prev[field]?.value;

      return {
        ...prev,
        [field]: { type, value: parseFieldValue(value, type) },
      };
    });
  };

  const handleUpdateFieldValue = (field: string, value: any) => {
    setUpdatedValues((prev) => {
      const type = prev[field]?.type || 'string';

      return {
        ...prev,
        [field]: { type, value: parseFieldValue(value, type) },
      };
    });
  };

  const handleUpdateJson = (field: string, value: any) => {
    setJsonUpdates((prev) => ({ ...prev, [field]: value }));

    setUpdatedValues((prev) => {
      const current = prev[field] || {};

      return {
        ...prev,
        [field]: isValidJson(value)
          ? { type: 'json', value: JSON.parse(value), error: null }
          : { ...current, type: 'json', error: 'Invalid JSON' },
      };
    });
  };

  const handleSaveRow = async () => {
    if (hasFormErrors) {
      setShouldDisplayErrors(true);
      return;
    }

    const params = Object.fromEntries(
      Object.entries(updates).map(([field, { value }]) => {
        return [field, value];
      })
    );
    await db.transact(tx[namespace.name][item.id ?? id()].update(params));
    onClose();
    successToast('Successfully updated row!');
  };

  return (
    <ActionForm className="p-4">
      <h5 className="flex text-lg font-bold">
        {item.id ? 'Edit row' : 'Add row'}
      </h5>
      <code className="text-sm font-medium font-mono text-gray-500">
        {item.id ? (
          <>
            {namespace.name}['{item.id}']
          </>
        ) : (
          <>{namespace.name}</>
        )}
      </code>
      <div className="flex flex-col gap-4 mt-4">
        {editableFieldNames.map((field) => {
          const { type, value, error } = updates[field] || {
            type: 'string',
            value: '',
          };
          const json = jsonUpdates[field] || JSON.stringify(value, null, 2);

          return (
            <div key={field} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Label className="font-mono">{field}</Label>
                <Select
                  className="w-24 rounded text-sm py-0.5 px-2"
                  value={type}
                  options={fieldTypeOptions}
                  onChange={(option) =>
                    handleChangeFieldType(field, option!.value as FieldType)
                  }
                />
              </div>
              <div className="flex gap-1 flex-col">
                {type === 'json' ? (
                  <div className="h-32 border rounded w-full">
                    <CodeEditor
                      language="json"
                      value={json}
                      onChange={(code) => handleUpdateJson(field, code)}
                    />
                  </div>
                ) : type === 'boolean' ? (
                  <Select
                    value={value}
                    options={[
                      { value: 'true', label: 'true' },
                      { value: 'false', label: 'false' },
                    ]}
                    onChange={(option) =>
                      handleUpdateFieldValue(field, option!.value)
                    }
                  />
                ) : (
                  <input
                    className="flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400"
                    value={value ?? ''}
                    onChange={(e) =>
                      handleUpdateFieldValue(field, e.target.value)
                    }
                  />
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
