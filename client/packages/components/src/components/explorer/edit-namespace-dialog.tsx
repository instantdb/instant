import React from 'react';
import { id } from '@instantdb/core';
import { InstantReactWebDatabase } from '@instantdb/react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
  MutableRefObject,
} from 'react';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid';
import { errorToast, successToast } from '@lib/components/toast';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  cn,
  Content,
  Divider,
  IconButton,
  InfoTip,
  Label,
  ProgressButton,
  Select,
  TextInput,
  ToggleGroup,
} from '@lib/components/ui';
import {
  OnDelete,
  RelationshipKinds,
  relationshipConstraints,
  relationshipConstraintsInverse,
} from '@lib/types';
import {
  CheckedDataType,
  DBAttr,
  InstantIndexingJob,
  InstantIndexingJobInvalidTriple,
  SchemaAttr,
  SchemaNamespace,
} from '@lib/types';
import {
  createJob,
  jobFetchLoop,
  jobIsCompleted,
  jobIsErrored,
} from '@lib/utils/indexingJobs';
import { useExplorerProps, useExplorerState } from './index';
import { useClose } from '@headlessui/react';
import {
  PendingJob,
  useEditBlobConstraints,
} from '@lib/hooks/useEditBlobConstraints';
import { RecentlyDeletedAttrs } from './recently-deleted';
import { useAttrNotes } from '@lib/hooks/useAttrNotes';
import { createRenameNamespaceOps } from '@lib/utils/renames';
import { useSWRConfig } from 'swr';

export function EditNamespaceDialog({
  db,
  namespace,
  namespaces,
  onClose,
  isSystemCatalogNs,
}: {
  db: InstantReactWebDatabase<any>;
  namespace: SchemaNamespace;
  namespaces: SchemaNamespace[];
  onClose: (p?: { ok: boolean }) => void;
  readOnly: boolean;
  isSystemCatalogNs: boolean;
}) {
  const props = useExplorerProps();
  const appId = props.appId;
  const { history, explorerState } = useExplorerState();
  const { mutate } = useSWRConfig();
  const [screen, setScreen] = useState<
    | { type: 'main' }
    | { type: 'delete' }
    | { type: 'rename' }
    | { type: 'add' }
    | { type: 'edit'; attrId: string; isForward: boolean }
  >({ type: 'main' });

  const [renameNsInput, setRenameNsInput] = useState(namespace.name);
  const [renameNsErrorText, setRenameNsErrorText] = useState<string | null>(
    null,
  );

  async function deleteNs() {
    const ops = namespace.attrs.map((attr) => ['delete-attr', attr.id]);
    await db.core._reactor.pushOps(ops);
    // update the recently deleted attr cache
    setTimeout(() => {
      mutate(['recently-deleted', appId]);
    }, 500);
    onClose({ ok: true });
  }

  async function renameNs(newName: string) {
    if (newName.startsWith('$')) {
      setRenameNsErrorText('Namespace name cannot start with $');
      return;
    }

    const ops = createRenameNamespaceOps(newName, namespace, namespaces);

    await db.core._reactor.pushOps(ops);
    history.push(
      {
        namespace: newName,
      },
      true,
    );
    successToast('Renamed namespace to ' + newName);
    setRenameNsInput('');
    setScreen({ type: 'main' });
  }

  const notes = useAttrNotes();

  const screenAttr = useMemo(() => {
    return (
      screen.type === 'edit' &&
      namespace.attrs.find(
        (a) => a.id === screen.attrId && a.isForward === screen.isForward,
      )
    );
  }, [
    screen.type === 'edit' ? screen.attrId : null,
    screen.type === 'edit' ? screen.isForward : null,
    namespace.attrs,
  ]);

  return (
    <>
      {screen.type === 'rename' && (
        <div className="px-2">
          <button
            onClick={() => {
              setScreen({
                type: 'main',
              });
            }}
            className="mb-3"
          >
            <ArrowLeftIcon className="h-4 w-4 cursor-pointer" />
          </button>
          <h6 className="text-md pb-2 font-bold">Rename {namespace.name}</h6>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              renameNs(renameNsInput);
            }}
          >
            <Content className="pb-2 text-sm">
              This will immediately rename the namespace. You'll need to{' '}
              <strong className="dark:text-white">update your code</strong> to
              the new name.
            </Content>
            <TextInput
              disabled={isSystemCatalogNs}
              value={renameNsInput}
              onChange={(n) => setRenameNsInput(n)}
            />
            <div className="flex flex-col gap-2 rounded-sm py-2">
              <Button
                type="submit"
                disabled={
                  renameNsInput.startsWith('$') || renameNsInput.length === 0
                }
              >
                Rename {namespace.name} → {renameNsInput}
              </Button>
            </div>
          </form>{' '}
        </div>
      )}

      {screen.type === 'main' ? (
        <div className="flex flex-col gap-4 px-2">
          <div className="mr-8 flex gap-1">
            <h5 className="flex items-center text-lg font-bold">
              {namespace.name}
            </h5>
            <IconButton
              variant="subtle"
              onClick={() => {
                setScreen({ type: 'rename' });
              }}
              icon={
                <PencilSquareIcon className="h-4 w-4 opacity-50"></PencilSquareIcon>
              }
              label="Rename"
            ></IconButton>

            <Button
              className="ml-4"
              disabled={isSystemCatalogNs}
              title={
                isSystemCatalogNs
                  ? `The ${namespace.name} namespace can't be deleted.`
                  : undefined
              }
              size="mini"
              variant="secondary"
              onClick={() => setScreen({ type: 'delete' })}
            >
              <TrashIcon className="inline" height="1rem" />
              Delete
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {namespace.attrs.map((attr) => (
              <div
                key={attr.id + '-' + attr.name}
                className="flex justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="py-0.5 font-bold">{attr.name}</span>
                  {notes.notes[attr.id]?.message && (
                    <InfoTip>
                      <div className="px-2 text-xs text-gray-500 dark:text-neutral-400">
                        {notes.notes[attr.id].message}
                      </div>
                    </InfoTip>
                  )}
                </div>
                {attr.name !== 'id' ? (
                  <Button
                    className="px-2"
                    size="mini"
                    variant="subtle"
                    onClick={() => {
                      notes.removeNote(attr.id);
                      setScreen({
                        type: 'edit',
                        attrId: attr.id,
                        isForward: attr.isForward,
                      });
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <div>
            <Button
              size="mini"
              variant="secondary"
              onClick={() => setScreen({ type: 'add' })}
            >
              <PlusIcon className="inline" height="12px" />
              New attribute
            </Button>
          </div>
          <RecentlyDeletedAttrs
            notes={notes}
            db={db}
            appId={appId}
            namespace={namespace}
          />
        </div>
      ) : screen.type === 'add' ? (
        <AddAttrForm
          db={db}
          namespace={namespace}
          namespaces={namespaces}
          onClose={() => setScreen({ type: 'main' })}
          constraints={getSystemConstraints({
            namespaceName: namespace.name,
            isSystemCatalogNs,
          })}
        />
      ) : screen.type === 'delete' ? (
        <DeleteForm
          name={namespace.name}
          type="namespace"
          onClose={onClose}
          onConfirm={deleteNs}
        />
      ) : screen.type === 'edit' && screenAttr ? (
        <EditAttrForm
          db={db}
          attr={screenAttr}
          onClose={() => setScreen({ type: 'main' })}
          constraints={getSystemConstraints({
            namespaceName: namespace.name,
            isSystemCatalogNs: isSystemCatalogNs,
            attr: screenAttr,
          })}
        />
      ) : null}
    </>
  );
}

function DeleteForm({
  name,
  type,
  onClose,
  onConfirm,
}: {
  name: string;
  type: 'namespace' | 'attribute';
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ActionForm className="min flex flex-col gap-4">
      <h5 className="flex items-center gap-2 text-lg font-bold">
        <ArrowLeftIcon
          height="1rem"
          className="cursor-pointer"
          onClick={() => onClose()}
        />
        Delete {name}
      </h5>

      <div className="flex flex-col gap-2">
        <p className="pb-2">
          Are you sure you want to delete the <strong>{name}</strong> {type}?
        </p>
        <ActionButton
          variant="destructive"
          label={`Delete ${name}`}
          submitLabel="Deleting..."
          errorMessage="Failed to delete"
          onClick={onConfirm}
        />
      </div>
    </ActionForm>
  );
}

function AddAttrForm({
  db,
  namespace,
  namespaces,
  onClose,
  constraints,
}: {
  db: InstantReactWebDatabase<any>;
  namespace: SchemaNamespace;
  namespaces: SchemaNamespace[];
  onClose: () => void;
  constraints: SystemConstraints;
}) {
  const [isRequired, setIsRequired] = useState(false);
  const [isIndex, setIsIndex] = useState(false);
  const [isUniq, setIsUniq] = useState(false);
  const [onDelete, setOnDelete] = useState<OnDelete>(null);
  const [onDeleteReverse, setOnDeleteReverse] = useState<OnDelete>(null);
  const [checkedDataType, setCheckedDataType] =
    useState<CheckedDataType | null>(null);
  const [attrType, setAttrType] = useState<'blob' | 'ref'>('blob');
  const [relationship, setRelationship] =
    useState<RelationshipKinds>('many-many');

  const [reverseNamespace, setReverseNamespace] = useState<
    SchemaNamespace | undefined
  >(() => namespaces.find((n) => n.name !== namespace.name) ?? namespaces[0]);
  const [attrName, setAttrName] = useState('');
  const [reverseAttrName, setReverseAttrName] = useState(namespace.name);

  const isOnDeleteAllowed =
    relationship === 'one-one' || relationship === 'one-many';
  const isOnDeleteReverseAllowed =
    relationship === 'one-one' || relationship === 'many-one';

  const linkValidation = validateLink({
    attrName,
    reverseAttrName,
    namespaceName: namespace.name,
    reverseNamespaceName: reverseNamespace?.name,
  });

  const canSubmit = attrType === 'blob' ? attrName : linkValidation.isValidLink;

  useEffect(() => {
    if (attrType !== 'ref') return;
    if (!reverseNamespace) return;

    const isSelfLink = reverseNamespace.name === namespace.name;
    setAttrName(isSelfLink ? 'parent' : reverseNamespace.name);
    setReverseAttrName(isSelfLink ? 'children' : namespace.name);
    if (isSelfLink) {
      setRelationship('one-many');
    }
  }, [attrType, reverseNamespace]);

  async function addAttr() {
    if (attrType === 'blob') {
      const attr: DBAttr = {
        id: id(),
        'forward-identity': [id(), namespace.name, attrName],
        'value-type': 'blob',
        cardinality: 'one',
        'unique?': isUniq,
        'index?': isIndex,
        'required?': isRequired,
        'checked-data-type': checkedDataType ?? undefined,
      };

      const ops = [['add-attr', attr]];
      await db._core._reactor.pushOps(ops);
      onClose();
    } else {
      // invariants
      if (!reverseNamespace) throw new Error('No reverse namespace');

      const attr: DBAttr = {
        id: id(),
        ...relationshipConstraints[relationship],
        'forward-identity': [id(), namespace.name, attrName],
        'reverse-identity': [id(), reverseNamespace.name, reverseAttrName],
        'value-type': 'ref',
        'index?': false,
        'required?': isRequired,
        'on-delete': isOnDeleteAllowed ? onDelete : undefined,
        'on-delete-reverse': isOnDeleteReverseAllowed
          ? onDeleteReverse
          : undefined,
      };

      const ops = [['add-attr', attr]];
      await db._core._reactor.pushOps(ops);
      onClose();
    }
  }

  return (
    <ActionForm className="min flex flex-col gap-4">
      <h5 className="flex items-center gap-2 text-lg font-bold">
        <ArrowLeftIcon className="h-4 w-4 cursor-pointer" onClick={onClose} />
        Add an attribute
      </h5>

      <div className="flex flex-col gap-1">
        <h6 className="text-md font-bold">Type</h6>
        <ToggleGroup
          ariaLabel="Text alignment"
          selectedId={attrType}
          items={[
            { id: 'blob', label: 'Data' },
            { id: 'ref', label: 'Link' },
          ]}
          onChange={(item) => setAttrType(item.id as 'blob' | 'ref')}
        />
      </div>
      {attrType === 'blob' ? (
        <>
          <div className="flex flex-1 flex-col gap-1">
            <h6 className="text-md font-bold">Name</h6>
            <TextInput value={attrName} onChange={(n) => setAttrName(n)} />
          </div>
          <div className="flex flex-col gap-2">
            <h6 className="text-md font-bold">Constraints</h6>
            <div className="flex gap-2">
              <Checkbox
                disabled={constraints.require.disabled}
                checked={isRequired}
                onChange={(enabled) => setIsRequired(enabled)}
                label={
                  <span>
                    <strong>Require this attribute</strong> so all entities will
                    be guaranteed to have it
                  </span>
                }
                title={constraints.require.message}
              />
            </div>
            <div className="flex gap-2">
              <Checkbox
                checked={isIndex}
                onChange={(enabled) => setIsIndex(enabled)}
                label={
                  <span>
                    <strong>Index this attribute</strong> to improve lookup
                    performance of values
                  </span>
                }
              />
            </div>
            <div className="flex gap-2">
              <Checkbox
                checked={isUniq}
                onChange={(enabled) => setIsUniq(enabled)}
                label={
                  <span>
                    <strong>Enforce uniqueness</strong> so no two entities can
                    have the same value for this attribute
                  </span>
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h6 className="text-md font-bold">Enforce type</h6>
            <div className="flex gap-2">
              <Select<CheckedDataType | 'none'>
                value={checkedDataType || 'none'}
                onChange={(v) => {
                  if (!v) {
                    return;
                  }
                  const { value } = v;
                  if (value === 'none') {
                    setCheckedDataType(null);
                  }
                  setCheckedDataType(value as CheckedDataType);
                }}
                options={[
                  {
                    label: 'Any (not enforced)',
                    value: 'none',
                  },
                  {
                    label: 'String',
                    value: 'string',
                  },
                  {
                    label: 'Number',
                    value: 'number',
                  },
                  {
                    label: 'Boolean',
                    value: 'boolean',
                  },
                  {
                    label: 'Date',
                    value: 'date',
                  },
                ]}
              />
            </div>
          </div>
        </>
      ) : attrType === 'ref' ? (
        <>
          <div className="flex flex-col gap-1">
            <h6 className="text-md font-bold">Link to namespace</h6>
            <Select
              value={reverseNamespace?.id ?? undefined}
              options={namespaces.map((ns) => {
                const label =
                  ns.name + (ns.name === namespace.name ? ' (self-link)' : '');
                return {
                  label,
                  value: ns.id,
                };
              })}
              onChange={(item) => {
                if (!item) return;
                const ns = namespaces.find((n) => n.id === item.value);

                setReverseNamespace(ns);
              }}
            />
          </div>

          <RelationshipConfigurator
            relationship={relationship}
            attrName={attrName}
            reverseAttrName={reverseAttrName}
            namespaceName={namespace.name}
            reverseNamespaceName={reverseNamespace?.name}
            setAttrName={setAttrName}
            setReverseAttrName={setReverseAttrName}
            setRelationship={setRelationship}
            isOnDeleteAllowed={isOnDeleteAllowed}
            onDelete={onDelete}
            setOnDelete={setOnDelete}
            isOnDeleteReverseAllowed={isOnDeleteReverseAllowed}
            onDeleteReverse={onDeleteReverse}
            setOnDeleteReverse={setOnDeleteReverse}
            isRequired={isRequired}
            setIsRequired={setIsRequired}
            constraints={constraints}
          />
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <ActionButton
          type="submit"
          label="Create attribute"
          submitLabel="Creating attribute..."
          errorMessage="Failed to create attribute"
          disabled={!canSubmit}
          className="border-gray-500 disabled:opacity-20"
          onClick={addAttr}
        />
        {linkValidation.shouldShowSelfLinkNameError ? (
          <span className="text-red-500">
            Self-links must have different attribute names.
          </span>
        ) : null}
      </div>
    </ActionForm>
  );
}

function jobWorkingStatus(job: InstantIndexingJob | null) {
  if (
    !job ||
    (job.job_status !== 'processing' && job.job_status !== 'waiting')
  ) {
    return;
  }

  if (job.job_status === 'waiting') {
    return 'Waiting for worker...';
  }

  if (!job.work_estimate) {
    return 'Estimating work...';
  }

  const completed = Math.min(job.work_estimate, job.work_completed || 0);

  const percent = Math.floor((completed / job.work_estimate) * 100);

  return `${percent}% complete...`;
}

function InvalidTriplesSample({
  indexingJob,
  attr,
  onClickSample,
}: {
  indexingJob: InstantIndexingJob | null;
  attr: SchemaAttr;
  onClickSample: (triple: InstantIndexingJobInvalidTriple) => void;
}) {
  if (!indexingJob?.invalid_triples_sample?.length) {
    return;
  }
  return (
    <div>
      Here are the first few invalid entities we found:
      <table className="dark:text-netural-500 mx-2 my-2 flex-1 text-left font-mono text-xs text-gray-500">
        <thead className="bg-white text-gray-700 dark:bg-neutral-800 dark:text-white">
          <tr>
            <th className="pr-2">id</th>
            <th className="max-w-fit pr-2">{attr.name}</th>
            <th className="pr-2">type</th>
          </tr>
        </thead>
        <tbody>
          {indexingJob.invalid_triples_sample.slice(0, 3).map((t, i) => (
            <tr
              key={i}
              className="cursor-pointer rounded-md px-2 whitespace-nowrap hover:bg-gray-200"
              onClick={() => onClickSample(t)}
            >
              <td className="pr-2">
                <pre>{t.entity_id}</pre>
              </td>
              <td className="truncate pr-2" style={{ maxWidth: '12rem' }}>
                {JSON.stringify(t.value)}
              </td>
              <td className="pr-2">{t.json_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndexingJobError({
  indexingJob,
  attr,
  onClose,
}: {
  indexingJob?: InstantIndexingJob | null;
  attr: SchemaAttr;
  onClose: () => void;
}) {
  const { history } = useExplorerState();
  if (!indexingJob) return;
  if (indexingJob.error === 'missing-required-error') {
    return (
      <div className="mt-2 mb-2 border-l-2 border-l-red-500 pl-2">
        <div>
          {indexingJob.error_data?.count} <code>{attr.namespace}</code>{' '}
          {indexingJob.error_data?.count === 1 ? 'entity does' : 'entities do'}{' '}
          not have <code>{attr.name}</code> set.
        </div>
        <InvalidTriplesSample
          indexingJob={{
            ...indexingJob,
            invalid_triples_sample:
              indexingJob.error_data &&
              indexingJob.error_data['entity-ids']?.map((id) => ({
                entity_id: String(id),
                value: null,
                json_type: attr.checkedDataType || 'null',
              })),
          }}
          attr={attr}
          onClickSample={(t) => {
            history.push({
              namespace: attr.namespace,
              where: ['id', t.entity_id],
            });
            // It would be nice to have a way to minimize the dialog so you could go back
            onClose();
          }}
        />
      </div>
    );
  }

  if (indexingJob.error === 'triple-too-large-error') {
    return (
      <div className="mt-2 mb-2 border-l-2 border-l-red-500 pl-2">
        <div>Some of the existing data is too large to index. </div>
        <InvalidTriplesSample
          indexingJob={indexingJob}
          attr={attr}
          onClickSample={(t) => {
            history.push({
              namespace: attr.namespace,
              where: ['id', t.entity_id],
            });
            // It would be nice to have a way to minimize the dialog so you could go back
            onClose();
          }}
        />
      </div>
    );
  }

  if (indexingJob.error === 'invalid-triple-error') {
    return (
      <div className="mt-2 mb-2 border-l-2 border-l-red-500 pl-2">
        <div>
          The type can't be set to {indexingJob?.checked_data_type} because some
          data is the wrong type.
        </div>
        <InvalidTriplesSample
          indexingJob={indexingJob}
          attr={attr}
          onClickSample={(t) => {
            history.push({
              namespace: attr.namespace,
              where: ['id', t.entity_id],
            });
            // It would be nice to have a way to minimize the dialog so you could go back
            onClose();
          }}
        />
      </div>
    );
  }

  if (indexingJob.error === 'triple-not-unique-error') {
    return (
      <div className="mt-2 mb-2 border-l-2 border-l-red-500 pl-2">
        <div>Some of the existing data is not unique. </div>
        {indexingJob.invalid_unique_value != null ? (
          <div>
            Found{' '}
            <span
              className={
                typeof indexingJob.invalid_unique_value === 'object'
                  ? ''
                  : 'cursor-pointer underline'
              }
              onClick={
                typeof indexingJob.invalid_unique_value === 'object'
                  ? undefined
                  : () => {
                      history.push({
                        namespace: attr.namespace,
                        where: [attr.name, indexingJob.invalid_unique_value],
                      });
                      onClose();
                    }
              }
            >
              multiple entities with value{' '}
              <code>{JSON.stringify(indexingJob.invalid_unique_value)}</code>
            </span>
            .
          </div>
        ) : null}
        <InvalidTriplesSample
          indexingJob={indexingJob}
          attr={attr}
          onClickSample={(t) => {
            history.push({
              namespace: attr.namespace,
              where: ['id', t.entity_id],
            });
            onClose();
          }}
        />
      </div>
    );
  }
  // Catchall for unexpected errors
  if (indexingJob.error) {
    return (
      <div className="mt-2 mb-2 space-y-2 border-l-2 border-l-red-500 pl-2">
        <div>
          An unexpected error occured while changing constraints. Please share
          these details with the Instant team:
        </div>
        <pre>id: "{indexingJob.id}"</pre>
      </div>
    );
  }
}

function RelationshipConfigurator({
  attrName,
  reverseAttrName,
  namespaceName,
  reverseNamespaceName,
  relationship,
  setAttrName,
  setReverseAttrName,
  setRelationship,
  onDelete,
  setOnDelete,
  isOnDeleteAllowed,
  onDeleteReverse,
  setOnDeleteReverse,
  isOnDeleteReverseAllowed,
  isRequired,
  setIsRequired,
  constraints,
}: {
  relationship: RelationshipKinds;
  reverseNamespaceName: string | undefined;
  attrName: string;
  reverseAttrName: string;
  namespaceName: string;

  setAttrName: (n: string) => void;
  setReverseAttrName: (n: string) => void;
  setRelationship: (n: RelationshipKinds) => void;

  isOnDeleteAllowed: boolean;
  onDelete: OnDelete;
  setOnDelete: (n: OnDelete) => void;

  isOnDeleteReverseAllowed: boolean;
  onDeleteReverse: OnDelete;
  setOnDeleteReverse: (n: OnDelete) => void;

  isRequired: boolean;
  setIsRequired: (n: boolean) => void;
  constraints: SystemConstraints;
}) {
  const isFullLink = attrName && reverseNamespaceName && reverseAttrName;

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <h6 className="text-md font-bold">Forward attribute name</h6>
          <TextInput
            disabled={constraints.attr.disabled}
            title={constraints.attr.message}
            value={attrName}
            onChange={(n) => setAttrName(n)}
          />
          <div className="rounded-xs py-0.5 text-xs text-gray-500 dark:text-neutral-400">
            {isFullLink ? (
              <>
                <strong>
                  {namespaceName}.{attrName}
                </strong>{' '}
                will link to <strong>{reverseNamespaceName}</strong>
              </>
            ) : (
              <>&nbsp;</>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <h6 className="text-md font-bold">Reverse attribute name</h6>
          <TextInput
            disabled={constraints.attr.disabled}
            title={constraints.attr.message}
            value={reverseAttrName}
            onChange={(n) => setReverseAttrName(n)}
          />
          <div className="rounded-xs py-0.5 text-xs text-gray-500 dark:text-neutral-400">
            {isFullLink ? (
              <>
                <strong>
                  {reverseNamespaceName}.{reverseAttrName}
                </strong>{' '}
                will link to <strong>{namespaceName}</strong>
              </>
            ) : (
              <>&nbsp;</>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h6 className="text-md font-bold">Relationship</h6>
        <RelationshipSelect
          disabled={!isFullLink || constraints.attr.disabled}
          value={relationship}
          onChange={(v) => {
            setRelationship(v.value);
          }}
          namespace={namespaceName}
          reverseNamespace={reverseNamespaceName ?? ''}
          attr={attrName}
          reverseAttr={reverseAttrName}
          title={
            constraints.attr.disabled ? constraints.attr.message : undefined
          }
        />
        <div
          className={
            'text-xs wrap-break-word text-gray-500 dark:text-neutral-400'
          }
        >
          {isFullLink ? (
            relationshipDescriptions[relationship](
              namespaceName,
              reverseNamespaceName,
              attrName,
              reverseAttrName,
            )
          ) : (
            <>&nbsp;</>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Checkbox
          checked={isOnDeleteAllowed && onDelete === 'cascade'}
          disabled={!isOnDeleteAllowed || constraints.attr.disabled}
          onChange={() =>
            setOnDelete(onDelete === 'cascade' ? null : 'cascade')
          }
          title={constraints.attr.message}
          label={
            <span className="dark:text-neutral-200">
              <div>
                <strong>
                  Cascade Delete {reverseNamespaceName} → {namespaceName}
                </strong>
              </div>
              When a <strong>{reverseNamespaceName}</strong> entity is deleted,
              all linked <strong>{namespaceName}</strong> will be deleted
              automatically
            </span>
          }
        />
      </div>
      <div className="flex gap-2">
        <Checkbox
          checked={isOnDeleteAllowed && onDelete === 'restrict'}
          disabled={!isOnDeleteAllowed || constraints.attr.disabled}
          onChange={() =>
            setOnDelete(onDelete === 'restrict' ? null : 'restrict')
          }
          title={constraints.attr.message}
          label={
            <span className="dark:text-neutral-200">
              <div>
                <strong>
                  Restrict Delete {reverseNamespaceName} → {namespaceName}
                </strong>
              </div>
              When a <strong>{reverseNamespaceName}</strong> entity is deleted,
              all linked <strong>{namespaceName}</strong> must be deleted first
              or the transaction will be blocked
            </span>
          }
        />
      </div>

      <div className="flex gap-2">
        <Checkbox
          checked={isOnDeleteReverseAllowed && onDeleteReverse === 'cascade'}
          disabled={!isOnDeleteReverseAllowed || constraints.attr.disabled}
          onChange={() =>
            setOnDeleteReverse(onDeleteReverse === 'cascade' ? null : 'cascade')
          }
          title={constraints.attr.message}
          label={
            <span className="dark:text-neutral-200">
              <div>
                <strong>
                  Cascade Delete {namespaceName} → {reverseNamespaceName}
                </strong>
              </div>
              When a <strong>{namespaceName}</strong> entity is deleted, all
              linked <strong>{reverseNamespaceName}</strong> must be deleted
              automatically
            </span>
          }
        />
      </div>

      <div className="flex gap-2">
        <Checkbox
          checked={isOnDeleteReverseAllowed && onDeleteReverse === 'restrict'}
          disabled={!isOnDeleteReverseAllowed || constraints.attr.disabled}
          onChange={() =>
            setOnDeleteReverse(
              onDeleteReverse === 'restrict' ? null : 'restrict',
            )
          }
          title={constraints.attr.message}
          label={
            <span className="dark:text-neutral-200">
              <div>
                <strong>
                  Restrict Delete {namespaceName} → {reverseNamespaceName}
                </strong>
              </div>
              When a <strong>{namespaceName}</strong> entity is deleted, all
              linked <strong>{reverseNamespaceName}</strong> must be deleted
              first or the transaction will be blocked
            </span>
          }
        />
      </div>

      <div className="flex flex-col gap-1">
        <h6 className="text-md font-bold">Constraints</h6>
        <div className="flex gap-2">
          <Checkbox
            disabled={constraints.require.disabled}
            title={constraints.require.message}
            checked={isRequired}
            onChange={(enabled) => setIsRequired(enabled)}
            label={
              <span>
                <strong>Require this attribute</strong> so all entities will be
                guaranteed to have it
              </span>
            }
          />
        </div>
      </div>
    </>
  );
}

function RelationshipSelect({
  value,
  disabled,
  onChange,
  namespace,
  attr,
  reverseNamespace,
  reverseAttr,
  title,
}: {
  disabled?: boolean;
  value: RelationshipKinds;
  onChange: (v: { value: RelationshipKinds; label: string }) => void;
  namespace: string;
  attr: string;
  reverseNamespace: string;
  reverseAttr: string;
  title?: string;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onChange={(v) => {
        if (!v) return;

        onChange(v as { value: RelationshipKinds; label: string });
      }}
      options={[
        {
          label: 'Many-to-many',
          value: 'many-many',
        },
        {
          label: 'One-to-one',
          value: 'one-one',
        },
        {
          label: `${namespace} has-many ${
            attr || '---'
          } / ${reverseNamespace} has-one ${reverseAttr || '---'}`,
          value: 'many-one',
        },
        {
          label: `${namespace} has-one ${
            attr || '---'
          } / ${reverseNamespace} has-many ${reverseAttr || '---'}`,
          value: 'one-many',
        },
      ]}
      title={title}
    />
  );
}

const relationshipDescriptions: Record<
  RelationshipKinds,
  (f: string, r: string, fa: string, ra: string) => ReactNode
> = {
  'many-many': (fn, rn, fa, ra) => (
    <>
      <strong>{fn}</strong> can have many <strong>{fa}</strong>, and{' '}
      <strong>{rn}</strong> can be associated with more than one{' '}
      <strong>{ra}</strong>
    </>
  ),
  'one-one': (fn, rn, fa, ra) => (
    <>
      <strong>{fn}</strong> can have only one <strong>{fa}</strong>, and a{' '}
      <strong>{rn}</strong> can only have one <strong>{ra}</strong>
    </>
  ),
  'many-one': (fn, rn, fa, ra) => (
    <>
      <strong>{fn}</strong> can have many <strong>{fa}</strong>, but{' '}
      <strong>{rn}</strong> can only have one <strong>{ra}</strong>
    </>
  ),
  'one-many': (fn, rn, fa, ra) => (
    <>
      <strong>{fn}</strong> can have only one <strong>{fa}</strong>, but{' '}
      <strong>{rn}</strong> can be associated with more than one{' '}
      <strong>{ra}</strong>
    </>
  ),
};

async function updateRequired({
  appId,
  attr,
  isRequired,
  authToken,
  setIndexingJob,
  stopFetchLoop,
  apiURI,
}: {
  appId: string;
  attr: SchemaAttr;
  isRequired: boolean;
  authToken: string | undefined;
  setIndexingJob: (job: InstantIndexingJob) => void;
  apiURI: string;
  stopFetchLoop: MutableRefObject<null | (() => void)>;
}) {
  if (!authToken || isRequired === attr.isRequired) {
    return;
  }
  stopFetchLoop.current?.();
  const friendlyName = `${attr.namespace}.${attr.name}`;
  try {
    const job = await createJob(
      {
        appId,
        attrId: attr.id,
        jobType: isRequired ? 'required' : 'remove-required',
        apiURI,
      },
      authToken,
    );
    setIndexingJob(job);
    const fetchLoop = jobFetchLoop(appId, job.id, authToken, apiURI);
    stopFetchLoop.current = fetchLoop.stop;
    const finishedJob = await fetchLoop.start((data, error) => {
      if (error) {
        errorToast(`Error while marking ${friendlyName} as required.`);
      }
      if (data) {
        setIndexingJob(data);
      }
    });
    if (finishedJob) {
      if (finishedJob.job_status === 'completed') {
        successToast(
          isRequired
            ? `Marked ${friendlyName} as required.`
            : `Marked ${friendlyName} as optional.`,
        );
        return 'completed';
      }
      if (finishedJob.job_status === 'canceled') {
        errorToast('Marking required was canceled.');
        return 'canceled';
      }
      if (finishedJob.job_status === 'errored') {
        if (finishedJob.error === 'invalid-triple-error') {
          errorToast(`Found invalid data while updating ${friendlyName}.`);
        } else {
          errorToast(`Encountered an error while updating ${friendlyName}.`);
        }
        return 'errored';
      }
    }
  } catch (e) {
    console.error(e);
    errorToast(`Unexpected error while updating ${friendlyName}`);
    return 'errored';
  }
}

type BlobConstraintControlComponent<V> = (props: {
  pendingJob?: PendingJob;
  runningJob?: InstantIndexingJob;
  value: V;
  setValue: (v: V) => void;
  disabled: boolean;
  disabledReason?: string;
  attr: SchemaAttr;
}) => JSX.Element;

const EditCheckedDataTypeControl: BlobConstraintControlComponent<
  CheckedDataType | 'any'
> = ({
  pendingJob,
  runningJob,
  value,
  setValue,
  disabled,
  disabledReason,
  attr,
}) => {
  const notRunning = !runningJob || jobIsCompleted(runningJob);
  const closeDialog = useClose();

  // Revert to previous value if job errored
  useEffect(() => {
    if (runningJob && jobIsErrored(runningJob)) {
      setValue(attr.checkedDataType || 'any');
    }
  }, [runningJob]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h6 className="text-md font-bold">
          Enforce type{' '}
          <InfoTip>
            <div className="w-48 text-sm">
              Checks the type on all existing entities and enforces the type
              when entities are created or updated.
            </div>
          </InfoTip>
        </h6>
      </div>
      <div className="flex items-center gap-2">
        <Select
          className={cn(
            pendingJob &&
              'border-[#606AF4] ring-1 ring-[#606AF4] ring-inset focus:ring-[#606AF4]',
          )}
          disabled={disabled || (runningJob && !jobIsCompleted(runningJob))}
          title={disabled ? disabledReason : undefined}
          value={value}
          onChange={(v) => {
            if (!v) {
              return;
            }
            setValue(v.value as CheckedDataType | 'any');
          }}
          options={[
            {
              label: 'Any (not enforced)',
              value: 'any',
            },
            {
              label: 'String',
              value: 'string',
            },
            {
              label: 'Number',
              value: 'number',
            },
            {
              label: 'Boolean',
              value: 'boolean',
            },
            {
              label: 'Date',
              value: 'date',
            },
          ]}
        />
        {pendingJob && notRunning && (
          <ArrowUturnLeftIcon
            onClick={() => {
              setValue(attr.checkedDataType || 'any');
            }}
            height="1.2rem"
            className="cursor-pointer pr-2 text-[#606AF4]"
          />
        )}
      </div>
      {runningJob && jobIsErrored(runningJob) && (
        <IndexingJobError
          indexingJob={runningJob}
          attr={attr}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

const EditRequiredControl: BlobConstraintControlComponent<boolean> = ({
  pendingJob,
  runningJob,
  value,
  setValue,
  disabled,
  disabledReason,
  attr,
}) => {
  const closeDialog = useClose();

  // If job is errored, revert the value
  useEffect(() => {
    if (runningJob && jobIsErrored(runningJob)) {
      setValue(attr.isRequired || false);
    }
  }, [runningJob]);

  return (
    <>
      <div className="flex justify-between">
        <Checkbox
          disabled={disabled || (runningJob && !jobIsCompleted(runningJob))}
          title={disabled ? disabledReason : undefined}
          checked={value}
          onChange={(enabled) => setValue(enabled)}
          label={
            <span
              className={cn(
                disabled || (runningJob && !jobIsCompleted(runningJob))
                  ? 'cursor-default'
                  : 'cursor-pointer',
                pendingJob && 'text-[#606AF4]',
              )}
            >
              <strong>Require this attribute</strong> so all entities will be
              guaranteed to have it
            </span>
          }
        />
        {pendingJob && (
          <ArrowUturnLeftIcon
            onClick={() => {
              setValue(!value);
            }}
            height="1.2rem"
            className="cursor-pointer pr-2 text-[#606AF4]"
          />
        )}
      </div>
      {runningJob && jobIsErrored(runningJob) && (
        <IndexingJobError
          indexingJob={runningJob}
          attr={attr}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

const EditIndexedControl: BlobConstraintControlComponent<boolean> = ({
  pendingJob,
  runningJob,
  value,
  setValue,
  disabled,
  disabledReason,
  attr,
}) => {
  const closeDialog = useClose();

  // If job is errored, revert the value
  useEffect(() => {
    if (runningJob && jobIsErrored(runningJob)) {
      setValue(attr.isIndex);
    }
  }, [runningJob]);

  return (
    <>
      <div className="flex justify-between">
        <Checkbox
          disabled={disabled || (runningJob && !jobIsCompleted(runningJob))}
          title={disabled ? disabledReason : undefined}
          checked={value}
          onChange={(enabled) => setValue(enabled)}
          label={
            <span
              className={cn(
                disabled || (runningJob && !jobIsCompleted(runningJob))
                  ? 'cursor-default'
                  : 'cursor-pointer',
                pendingJob && 'text-[#606AF4]',
              )}
            >
              <strong>Index this attribute</strong> to improve lookup
              performance of values
            </span>
          }
        />
        {pendingJob && (
          <ArrowUturnLeftIcon
            onClick={() => {
              setValue(!value);
            }}
            height="1.2rem"
            className="cursor-pointer pr-2 text-[#606AF4]"
          />
        )}
      </div>
      {runningJob && jobIsErrored(runningJob) && (
        <IndexingJobError
          indexingJob={runningJob}
          attr={attr}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

const EditUniqueControl: BlobConstraintControlComponent<boolean> = ({
  pendingJob,
  runningJob,
  value,
  setValue,
  disabled,
  disabledReason,
  attr,
}) => {
  const closeDialog = useClose();

  // If job is errored, revert the value
  useEffect(() => {
    if (runningJob && jobIsErrored(runningJob)) {
      setValue(attr.isUniq);
    }
  }, [runningJob]);

  return (
    <>
      <div className="flex justify-between">
        <Checkbox
          disabled={disabled || (runningJob && !jobIsCompleted(runningJob))}
          title={disabled ? disabledReason : undefined}
          checked={value}
          onChange={(enabled) => setValue(enabled)}
          label={
            <span
              className={cn(
                disabled || (runningJob && !jobIsCompleted(runningJob))
                  ? 'cursor-default'
                  : 'cursor-pointer',
                pendingJob && 'text-[#606AF4]',
              )}
            >
              <strong>Enforce uniqueness</strong> so no two entities can have
              the same value for this attribute
            </span>
          }
        />
        {pendingJob && (
          <ArrowUturnLeftIcon
            onClick={() => {
              setValue(!value);
            }}
            height="1.2rem"
            className="cursor-pointer pr-2 text-[#606AF4]"
          />
        )}
      </div>
      {runningJob && jobIsErrored(runningJob) && (
        <IndexingJobError
          indexingJob={runningJob}
          attr={attr}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

const EditBlobConstraints = ({
  appId,
  attr,
  constraints,
}: {
  appId: string;
  attr: SchemaAttr;
  constraints: SystemConstraints;
}) => {
  const [requiredChecked, setRequiredChecked] = useState(
    attr.isRequired || false,
  );

  const [indexedChecked, setIndexedChecked] = useState(attr.isIndex);

  const [uniqueChecked, setUniqueChecked] = useState(attr.isUniq);

  const [checkedDataType, setCheckedDataType] = useState<
    CheckedDataType | 'any'
  >(attr.checkedDataType || 'any');

  const explorerProps = useExplorerProps();

  const { isPending, pending, apply, isRunning, running, progress } =
    useEditBlobConstraints({
      attr,
      appId,
      token: explorerProps.adminToken,
      isRequired: requiredChecked,
      isIndexed: indexedChecked,
      isUnique: uniqueChecked,
      checkedDataType,
    });

  return (
    <div>
      <div className="flex flex-col gap-2">
        <h6 className="text-md font-bold">Constraints</h6>
        <EditRequiredControl
          pendingJob={pending.require}
          runningJob={running.require}
          value={requiredChecked}
          setValue={setRequiredChecked}
          disabled={constraints.require.disabled}
          disabledReason={constraints.require.message}
          attr={attr}
        />
        <EditIndexedControl
          pendingJob={pending.index}
          runningJob={running.index}
          value={indexedChecked}
          setValue={setIndexedChecked}
          disabled={constraints.attr.disabled}
          disabledReason={constraints.attr.message}
          attr={attr}
        />
        <EditUniqueControl
          pendingJob={pending.unique}
          runningJob={running.unique}
          value={uniqueChecked}
          setValue={setUniqueChecked}
          disabled={constraints.attr.disabled}
          disabledReason={constraints.attr.message}
          attr={attr}
        />
        <EditCheckedDataTypeControl
          pendingJob={pending.type}
          runningJob={running.type}
          value={checkedDataType}
          setValue={setCheckedDataType}
          disabled={constraints.attr.disabled}
          disabledReason={constraints.attr.message}
          attr={attr}
        />
        <ProgressButton
          loading={!!progress}
          percentage={!isRunning ? 0 : progress || 0}
          variant={isPending || isRunning ? 'primary' : 'secondary'}
          // Switching from primary <-> secondary changes height without this
          className="border"
          onClick={() => apply()}
          disabled={!isPending && !progress}
        >
          {isRunning ? 'Updating Constraints...' : 'Update Constraints'}
        </ProgressButton>
      </div>
    </div>
  );
};

function EditAttrForm({
  db,
  attr,
  onClose,
  constraints,
}: {
  db: InstantReactWebDatabase<any>;
  attr: SchemaAttr;
  onClose: () => void;
  constraints: SystemConstraints;
}) {
  const props = useExplorerProps();
  const appId = props.appId;
  const { mutate } = useSWRConfig();
  const [screen, setScreen] = useState<{ type: 'main' } | { type: 'delete' }>({
    type: 'main',
  });

  const [attrName, setAttrName] = useState(attr.linkConfig.forward.attr);
  const [reverseAttrName, setReverseAttrName] = useState(
    attr.linkConfig.reverse?.attr,
  );
  const [relationship, setRelationship] = useState<RelationshipKinds>(() => {
    const relKey = `${attr.cardinality}-${attr.isUniq}`;
    const relKind = relationshipConstraintsInverse[relKey];
    return relKind;
  });

  const explorerProps = useExplorerProps();

  const [onDelete, setOnDelete] = useState<OnDelete>(() => attr.onDelete);

  const [onDeleteReverse, setOnDeleteReverse] = useState<OnDelete>(
    () => attr.onDeleteReverse,
  );

  const [isRequired, setIsRequired] = useState(attr.isRequired || false);
  const [wasRequired, _] = useState(isRequired);

  const [indexingJob, setIndexingJob] = useState<InstantIndexingJob | null>(
    null,
  );

  const stopFetchLoop = useRef<null | (() => void)>(null);
  const closeDialog = useClose();

  useEffect(() => {
    return () => stopFetchLoop.current?.();
  }, [stopFetchLoop]);

  const isOnDeleteAllowed =
    relationship === 'one-one' || relationship === 'one-many';
  const isOnDeleteReverseAllowed =
    relationship === 'one-one' || relationship === 'many-one';

  const linkValidation = validateLink({
    attrName,
    reverseAttrName,
    namespaceName: attr.linkConfig.forward.namespace,
    reverseNamespaceName: attr.linkConfig.reverse?.namespace,
  });

  async function updateRef() {
    if (!attr.linkConfig.reverse) {
      throw new Error('No reverse link config');
    }

    if (isRequired !== wasRequired) {
      const res = await updateRequired({
        appId,
        attr,
        isRequired,
        authToken: explorerProps.adminToken,
        setIndexingJob,
        stopFetchLoop,
        apiURI: explorerProps.apiURI,
      });

      if (res != 'completed') return;
    }

    const ops = [
      [
        'update-attr',
        {
          id: attr.id,
          ...relationshipConstraints[relationship],
          'forward-identity': [
            attr.linkConfig.forward.id,
            attr.linkConfig.forward.namespace,
            attrName,
          ],
          'reverse-identity': [
            attr.linkConfig.reverse.id,
            attr.linkConfig.reverse.namespace,
            reverseAttrName,
          ],
          'on-delete': isOnDeleteAllowed ? onDelete : null,
          'on-delete-reverse': isOnDeleteReverseAllowed
            ? onDeleteReverse
            : null,
        },
      ],
    ];

    await db.core._reactor.pushOps(ops);

    // avoid showing 2 success toasts
    if (isRequired == wasRequired) {
      successToast('Updated attribute');
    }
  }

  async function renameBlobAttr() {
    const ops = [
      [
        'update-attr',
        {
          id: attr.id,
          'forward-identity': [
            attr.linkConfig.forward.id,
            attr.linkConfig.forward.namespace,
            attrName,
          ],
        },
      ],
    ];

    await db.core._reactor.pushOps(ops);

    successToast('Renamed attribute');
  }

  async function deleteAttr() {
    await db.core._reactor.pushOps([['delete-attr', attr.id]]);
    // update the recently deleted attr cache
    setTimeout(() => {
      mutate(['recently-deleted', appId]);
    }, 500);
    onClose();
  }

  if (screen.type === 'delete') {
    return (
      <DeleteForm
        onConfirm={deleteAttr}
        onClose={onClose}
        name={attr.name}
        type="attribute"
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="mr-8 flex gap-4">
        <div className="flex items-center gap-2">
          <ArrowLeftIcon className="h-4 w-4 cursor-pointer" onClick={onClose} />
          <h5 className="flex items-center text-lg font-bold">
            Edit {attr.namespace}.{attr.name}
          </h5>
        </div>

        <Button
          disabled={constraints.attr.disabled}
          title={constraints.attr.message}
          variant="secondary"
          size="mini"
          onClick={() => setScreen({ type: 'delete' })}
        >
          <TrashIcon className="inline" height="1rem" />
          Delete
        </Button>
      </div>

      {attr.type === 'blob' ? (
        <>
          <EditBlobConstraints
            appId={appId}
            attr={attr}
            constraints={constraints}
          />

          <Divider />

          <ActionForm className="flex flex-col gap-1">
            <h6 className="text-md font-bold">Rename</h6>
            <Content className="text-sm">
              This will immediately rename the attribute. You'll need to{' '}
              <strong className="dark:text-white">update your code</strong> to
              the new name.
            </Content>
            <TextInput
              disabled={constraints.attr.disabled}
              title={constraints.attr.message}
              value={attrName}
              onChange={(n) => setAttrName(n)}
            />
            <div className="flex flex-col gap-2 rounded-sm py-2">
              <ActionButton
                type="submit"
                label={`Rename ${attr.name} → ${attrName}`}
                submitLabel="Renaming attribute..."
                errorMessage="Failed to rename attribute"
                disabled={
                  constraints.attr.disabled ||
                  !attrName ||
                  attrName === attr.name
                }
                title={constraints.attr.message}
                onClick={renameBlobAttr}
              />
            </div>
          </ActionForm>
        </>
      ) : (
        <ActionForm className="flex flex-col gap-6">
          <RelationshipConfigurator
            relationship={relationship}
            attrName={attrName}
            reverseAttrName={reverseAttrName ?? ''}
            namespaceName={attr.linkConfig.forward.namespace}
            reverseNamespaceName={attr.linkConfig.reverse!.namespace}
            setAttrName={setAttrName}
            setReverseAttrName={setReverseAttrName}
            setRelationship={setRelationship}
            isOnDeleteAllowed={isOnDeleteAllowed}
            onDelete={onDelete}
            setOnDelete={setOnDelete}
            isOnDeleteReverseAllowed={isOnDeleteReverseAllowed}
            onDeleteReverse={onDeleteReverse}
            setOnDeleteReverse={setOnDeleteReverse}
            isRequired={isRequired}
            setIsRequired={setIsRequired}
            constraints={constraints}
          />

          <IndexingJobError
            indexingJob={indexingJob}
            attr={attr}
            onClose={() => {
              closeDialog();
              onClose();
            }}
          />

          <div className="flex flex-col gap-6">
            <ActionButton
              disabled={
                constraints.attr.disabled || !linkValidation.isValidLink
              }
              type="submit"
              label="Update relationship"
              submitLabel="Updating relationship..."
              errorMessage="Failed to update relationship"
              onClick={updateRef}
              title={constraints.attr.message}
            />
            {linkValidation.shouldShowSelfLinkNameError ? (
              <span className="text-red-500">
                Self-links must have different attribute names.
              </span>
            ) : null}
          </div>
        </ActionForm>
      )}
    </div>
  );
}
function validateLink({
  reverseNamespaceName,
  namespaceName,
  attrName,
  reverseAttrName,
}: {
  reverseNamespaceName: string | undefined;
  reverseAttrName: string | undefined;
  namespaceName: string;
  attrName: string;
}) {
  const isSelfLink =
    reverseNamespaceName && reverseNamespaceName === namespaceName;
  const isNonEmptyLink =
    attrName && namespaceName && reverseNamespaceName && reverseAttrName;
  const isValidSelfLinkNames = attrName !== reverseAttrName;
  const isValidLink =
    isNonEmptyLink && (isSelfLink ? isValidSelfLinkNames : true);
  const shouldShowSelfLinkNameError =
    isNonEmptyLink && isSelfLink && !isValidSelfLinkNames;

  return {
    isSelfLink,
    isNonEmptyLink,
    isValidLink,
    shouldShowSelfLinkNameError,
  };
}

type SystemConstraints = {
  attr: {
    disabled: boolean;
    message?: string;
  };
  require: {
    disabled: boolean;
    message?: string;
  };
};

function getSystemConstraints({
  namespaceName,
  isSystemCatalogNs: isSystemCatalogNs,
  attr: isSystemCatalogAttr,
}: {
  namespaceName: string;
  isSystemCatalogNs: boolean;
  attr?: SchemaAttr;
}): SystemConstraints {
  const isSystemAttr = isSystemCatalogAttr?.catalog === 'system';

  const attrMessage = isSystemCatalogAttr
    ? `${isSystemCatalogAttr.namespace}.${isSystemCatalogAttr.name} is managed by the system and can't be edited`
    : undefined;

  const requireMessage = isSystemAttr
    ? attrMessage
    : isSystemCatalogNs
      ? `The ${namespaceName} namespace is managed by the system and can't modify required constraints yet.`
      : undefined;

  return {
    attr: {
      disabled: isSystemAttr || false,
      message: attrMessage,
    },
    require: {
      disabled: isSystemAttr || isSystemCatalogNs,
      message: requireMessage,
    },
  };
}
