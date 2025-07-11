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
} from '@heroicons/react/24/solid';
import { errorToast, successToast } from '@/lib/toast';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  cn,
  Content,
  Divider,
  InfoTip,
  ProgressButton,
  Select,
  TextInput,
  ToggleGroup,
} from '@/components/ui';
import {
  RelationshipKinds,
  relationshipConstraints,
  relationshipConstraintsInverse,
} from '@/lib/relationships';
import {
  CheckedDataType,
  DBAttr,
  InstantIndexingJob,
  InstantIndexingJobInvalidTriple,
  SchemaAttr,
  SchemaNamespace,
} from '@/lib/types';
import {
  createJob,
  jobFetchLoop,
  jobIsCompleted,
  jobIsErrored,
} from '@/lib/indexingJobs';
import { useAuthToken } from '@/lib/auth';
import type { PushNavStack } from './Explorer';
import { useClose } from '@headlessui/react';
import {
  PendingJob,
  useEditBlobConstraints,
} from '@/lib/hooks/useEditBlobConstraints';

export function EditNamespaceDialog({
  db,
  appId,
  namespace,
  namespaces,
  onClose,
  readOnly,
  isSystemCatalogNs,
  pushNavStack,
}: {
  db: InstantReactWebDatabase<any>;
  appId: string;
  namespace: SchemaNamespace;
  namespaces: SchemaNamespace[];
  onClose: (p?: { ok: boolean }) => void;
  readOnly: boolean;
  isSystemCatalogNs: boolean;
  pushNavStack: PushNavStack;
}) {
  const [screen, setScreen] = useState<
    | { type: 'main' }
    | { type: 'delete' }
    | { type: 'add' }
    | { type: 'edit'; attrId: string; isForward: boolean }
  >({ type: 'main' });

  async function deleteNs() {
    const ops = namespace.attrs.map((attr) => ['delete-attr', attr.id]);
    await db._core._reactor.pushOps(ops);
    onClose({ ok: true });
  }

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
      {screen.type === 'main' ? (
        <div className="flex flex-col gap-4 px-2">
          <div className="mr-8 flex gap-4">
            <h5 className="flex items-center gap-2 text-lg font-bold">
              {namespace.name}
            </h5>
            <Button
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
                <span className="py-0.5 font-bold">{attr.name}</span>
                {attr.name !== 'id' ? (
                  <Button
                    className="px-2"
                    size="mini"
                    variant="subtle"
                    onClick={() =>
                      setScreen({
                        type: 'edit',
                        attrId: attr.id,
                        isForward: attr.isForward,
                      })
                    }
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <div>
            <Button
              disabled={isSystemCatalogNs}
              title={
                isSystemCatalogNs
                  ? `Attributes can't be added to the ${namespace.name} namespace directly. You can still create links to them by adding the links from one of your namespaces.`
                  : undefined
              }
              size="mini"
              variant="secondary"
              onClick={() => setScreen({ type: 'add' })}
            >
              <PlusIcon className="inline" height="12px" />
              New attribute
            </Button>
          </div>
        </div>
      ) : screen.type === 'add' ? (
        <AddAttrForm
          db={db}
          namespace={namespace}
          namespaces={namespaces}
          onClose={() => setScreen({ type: 'main' })}
        />
      ) : screen.type === 'delete' ? (
        <DeleteForm
          name={namespace.name}
          onClose={onClose}
          onConfirm={deleteNs}
        />
      ) : screen.type === 'edit' && screenAttr ? (
        <EditAttrForm
          appId={appId}
          isSystemCatalogNs={isSystemCatalogNs}
          db={db}
          attr={screenAttr}
          onClose={() => setScreen({ type: 'main' })}
          pushNavStack={pushNavStack}
        />
      ) : null}
    </>
  );
}

function DeleteForm({
  name,
  onClose,
  onConfirm,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [ok, setOk] = useState(false);

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
        <p>
          Deleting is an <strong>irreversible operation</strong> and will{' '}
          <strong>delete all data</strong> associated with{' '}
          <strong>{name}.</strong>
        </p>
        <p className="flex gap-2">
          <Checkbox
            checked={ok}
            onChange={(_ok) => setOk(_ok)}
            label="I understand"
          />
        </p>
        <ActionButton
          variant="destructive"
          disabled={!ok}
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
}: {
  db: InstantReactWebDatabase<any>;
  namespace: SchemaNamespace;
  namespaces: SchemaNamespace[];
  onClose: () => void;
}) {
  const [isRequired, setIsRequired] = useState(false);
  const [isIndex, setIsIndex] = useState(false);
  const [isUniq, setIsUniq] = useState(false);
  const [isCascade, setIsCascade] = useState(false);
  const [isCascadeReverse, setIsCascadeReverse] = useState(false);
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

  const isCascadeAllowed =
    relationship === 'one-one' || relationship === 'one-many';
  const isCascadeReverseAllowed =
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
        'on-delete': isCascadeAllowed && isCascade ? 'cascade' : undefined,
        'on-delete-reverse':
          isCascadeReverseAllowed && isCascadeReverse ? 'cascade' : undefined,
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
                checked={isRequired}
                onChange={(enabled) => setIsRequired(enabled)}
                label={
                  <span>
                    <strong>Require this attribute</strong> so all entities will
                    be guaranteed to have it
                  </span>
                }
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
            isCascadeAllowed={isCascadeAllowed}
            isCascade={isCascade}
            setIsCascade={setIsCascade}
            isCascadeReverseAllowed={isCascadeReverseAllowed}
            isCascadeReverse={isCascadeReverse}
            setIsCascadeReverse={setIsCascadeReverse}
            isRequired={isRequired}
            setIsRequired={setIsRequired}
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
      <table className="mx-2 my-2 flex-1 text-left font-mono text-xs text-gray-500">
        <thead className="bg-white text-gray-700">
          <tr>
            <th className="pr-2">id</th>
            <th className="pr-2 max-w-fit">{attr.name}</th>
            <th className="pr-2">type</th>
          </tr>
        </thead>
        <tbody>
          {indexingJob.invalid_triples_sample.slice(0, 3).map((t, i) => (
            <tr
              key={i}
              className="cursor-pointer whitespace-nowrap rounded-md px-2 hover:bg-gray-200"
              onClick={() => onClickSample(t)}
            >
              <td className="pr-2">
                <pre>{t.entity_id}</pre>
              </td>
              <td className="pr-2 truncate" style={{ maxWidth: '12rem' }}>
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
  pushNavStack,
  onClose,
}: {
  indexingJob?: InstantIndexingJob | null;
  attr: SchemaAttr;
  pushNavStack: PushNavStack;
  onClose: () => void;
}) {
  if (!indexingJob) return;

  if (indexingJob.error === 'missing-required-error') {
    return (
      <div className="mt-2 mb-2 pl-2 border-l-2 border-l-red-500">
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
            pushNavStack({
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
      <div className="mt-2 mb-2 pl-2 border-l-2 border-l-red-500">
        <div>Some of the existing data is too large to index. </div>
        <InvalidTriplesSample
          indexingJob={indexingJob}
          attr={attr}
          onClickSample={(t) => {
            pushNavStack({
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
      <div className="mt-2 mb-2 pl-2 border-l-2 border-l-red-500">
        <div>
          The type can't be set to {indexingJob?.checked_data_type} because some
          data is the wrong type.
        </div>
        <InvalidTriplesSample
          indexingJob={indexingJob}
          attr={attr}
          onClickSample={(t) => {
            pushNavStack({
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
      <div className="mt-2 mb-2 pl-2 border-l-2 border-l-red-500">
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
                      pushNavStack({
                        namespace: attr.namespace,
                        where: [attr.name, indexingJob.invalid_unique_value],
                      });
                      // It would be nice to have a way to minimize the dialog so you could go back
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
            pushNavStack({
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
  isCascade,
  setIsCascade,
  isCascadeAllowed,
  isCascadeReverse,
  setIsCascadeReverse,
  isCascadeReverseAllowed,
  isRequired,
  setIsRequired,
}: {
  relationship: RelationshipKinds;
  reverseNamespaceName: string | undefined;
  attrName: string;
  reverseAttrName: string;
  namespaceName: string;

  setAttrName: (n: string) => void;
  setReverseAttrName: (n: string) => void;
  setRelationship: (n: RelationshipKinds) => void;

  isCascadeAllowed: boolean;
  isCascade: boolean;
  setIsCascade: (n: boolean) => void;

  isCascadeReverseAllowed: boolean;
  isCascadeReverse: boolean;
  setIsCascadeReverse: (n: boolean) => void;

  isRequired: boolean;
  setIsRequired: (n: boolean) => void;
}) {
  const isFullLink = attrName && reverseNamespaceName && reverseAttrName;

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <h6 className="text-md font-bold">Forward attribute name</h6>
          <TextInput value={attrName} onChange={(n) => setAttrName(n)} />
          <div className="rounded-sm py-0.5 text-xs text-gray-500">
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
            value={reverseAttrName}
            onChange={(n) => setReverseAttrName(n)}
          />
          <div className="rounded-sm py-0.5 text-xs text-gray-500">
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
          disabled={!isFullLink}
          value={relationship}
          onChange={(v) => {
            setRelationship(v.value);
          }}
          namespace={namespaceName}
          reverseNamespace={reverseNamespaceName ?? ''}
          attr={attrName}
          reverseAttr={reverseAttrName}
        />
        <div className={'break-words text-xs text-gray-500'}>
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
          checked={isCascadeAllowed && isCascade}
          disabled={!isCascadeAllowed}
          onChange={setIsCascade}
          label={
            <span>
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
          checked={isCascadeReverseAllowed && isCascadeReverse}
          disabled={!isCascadeReverseAllowed}
          onChange={setIsCascadeReverse}
          label={
            <span>
              <div>
                <strong>
                  Cascade Delete {namespaceName} → {reverseNamespaceName}
                </strong>
              </div>
              When a <strong>{namespaceName}</strong> entity is deleted, all
              linked <strong>{reverseNamespaceName}</strong> will be deleted
              automatically
            </span>
          }
        />
      </div>

      <div className="flex flex-col gap-1">
        <h6 className="text-md font-bold">Constraints</h6>
        <div className="flex gap-2">
          <Checkbox
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
}: {
  disabled?: boolean;
  value: RelationshipKinds;
  onChange: (v: { value: RelationshipKinds; label: string }) => void;
  namespace: string;
  attr: string;
  reverseNamespace: string;
  reverseAttr: string;
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
}: {
  appId: string;
  attr: SchemaAttr;
  isRequired: boolean;
  authToken: string | undefined;
  setIndexingJob: (job: InstantIndexingJob) => void;
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
      },
      authToken,
    );
    setIndexingJob(job);
    const fetchLoop = jobFetchLoop(appId, job.id, authToken);
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
  attr: SchemaAttr;
  pushNavStack: PushNavStack;
}) => JSX.Element;

const EditCheckedDataTypeControl: BlobConstraintControlComponent<
  CheckedDataType | 'any'
> = ({
  pendingJob,
  runningJob,
  value,
  setValue,
  disabled,
  attr,
  pushNavStack,
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
            <div className="text-sm w-48">
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
              'border-[#606AF4] ring-1 ring-inset ring-[#606AF4] focus:ring-[#606AF4]',
          )}
          disabled={disabled || (runningJob && !jobIsCompleted(runningJob))}
          title={
            disabled
              ? `Attributes in the ${attr.namespace} namespace can't be edited.`
              : undefined
          }
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
          pushNavStack={pushNavStack}
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
  pushNavStack,
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
          title={
            disabled
              ? `Attributes in the ${attr.namespace} namespace can't be edited.`
              : undefined
          }
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
          pushNavStack={pushNavStack}
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
  attr,
  pushNavStack,
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
          title={
            disabled
              ? `Attributes in the ${attr.namespace} namespace can't be edited.`
              : undefined
          }
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
          pushNavStack={pushNavStack}
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
  pushNavStack,
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
          title={
            disabled
              ? `Attributes in the ${attr.namespace} namespace can't be edited.`
              : undefined
          }
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
          pushNavStack={pushNavStack}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

const EditBlobConstraints = ({
  appId,
  attr,
  isSystemCatalogNs,
  pushNavStack,
}: {
  appId: string;
  attr: SchemaAttr;
  isSystemCatalogNs: boolean;
  pushNavStack: PushNavStack;
}) => {
  const [requiredChecked, setRequiredChecked] = useState(
    attr.isRequired || false,
  );

  const [indexedChecked, setIndexedChecked] = useState(attr.isIndex);

  const [uniqueChecked, setUniqueChecked] = useState(attr.isUniq);

  const [checkedDataType, setCheckedDataType] = useState<
    CheckedDataType | 'any'
  >(attr.checkedDataType || 'any');

  const token = useAuthToken();
  if (!token) {
    return null;
  }

  const { isPending, pending, apply, isRunning, running, progress } =
    useEditBlobConstraints({
      attr,
      appId,
      token,
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
          disabled={isSystemCatalogNs}
          attr={attr}
          pushNavStack={pushNavStack}
        />
        <EditIndexedControl
          pendingJob={pending.index}
          runningJob={running.index}
          value={indexedChecked}
          setValue={setIndexedChecked}
          disabled={isSystemCatalogNs}
          attr={attr}
          pushNavStack={pushNavStack}
        />
        <EditUniqueControl
          pendingJob={pending.unique}
          runningJob={running.unique}
          value={uniqueChecked}
          setValue={setUniqueChecked}
          disabled={isSystemCatalogNs}
          attr={attr}
          pushNavStack={pushNavStack}
        />
        <EditCheckedDataTypeControl
          pendingJob={pending.type}
          runningJob={running.type}
          value={checkedDataType}
          setValue={setCheckedDataType}
          disabled={isSystemCatalogNs}
          attr={attr}
          pushNavStack={pushNavStack}
        />
        <ProgressButton
          loading={!!progress}
          percentage={progress || 0}
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
  appId,
  attr,
  onClose,
  isSystemCatalogNs,
  pushNavStack,
}: {
  db: InstantReactWebDatabase<any>;
  appId: string;
  attr: SchemaAttr;
  onClose: () => void;
  isSystemCatalogNs: boolean;
  pushNavStack: PushNavStack;
}) {
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

  const [isCascade, setIsCascade] = useState(() => attr.onDelete === 'cascade');

  const [isCascadeReverse, setIsCascadeReverse] = useState(
    () => attr.onDeleteReverse === 'cascade',
  );

  const [isRequired, setIsRequired] = useState(attr.isRequired || false);
  const [wasRequired, _] = useState(isRequired);

  const authToken = useAuthToken();
  const [indexingJob, setIndexingJob] = useState<InstantIndexingJob | null>(
    null,
  );

  const stopFetchLoop = useRef<null | (() => void)>(null);
  const closeDialog = useClose();

  useEffect(() => {
    return () => stopFetchLoop.current?.();
  }, [stopFetchLoop]);

  const isCascadeAllowed =
    relationship === 'one-one' || relationship === 'one-many';
  const isCascadeReverseAllowed =
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
        authToken,
        setIndexingJob,
        stopFetchLoop,
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
          'on-delete': isCascadeAllowed && isCascade ? 'cascade' : null,
          'on-delete-reverse':
            isCascadeReverseAllowed && isCascadeReverse ? 'cascade' : null,
        },
      ],
    ];

    await db._core._reactor.pushOps(ops);

    successToast('Updated attribute');
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

    await db._core._reactor.pushOps(ops);

    successToast('Renamed attribute');
  }

  async function deleteAttr() {
    await db._core._reactor.pushOps([['delete-attr', attr.id]]);
    onClose();
  }

  if (screen.type === 'delete') {
    return (
      <DeleteForm onConfirm={deleteAttr} onClose={onClose} name={attr.name} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mr-8 flex gap-4">
        <div className="flex gap-2 items-center">
          <ArrowLeftIcon className="h-4 w-4 cursor-pointer" onClick={onClose} />
          <h5 className="flex items-center text-lg font-bold">
            Edit {attr.namespace}.{attr.name}
          </h5>
        </div>

        <Button
          disabled={isSystemCatalogNs && attr.type !== 'ref'}
          title={
            isSystemCatalogNs && attr.type !== 'ref'
              ? `Attributes in the ${attr.namespace} can't be edited`
              : undefined
          }
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
            isSystemCatalogNs={isSystemCatalogNs}
            pushNavStack={pushNavStack}
          />

          <Divider />

          <ActionForm className="flex flex-col gap-1">
            <h6 className="text-md font-bold">Rename</h6>
            <Content className="text-sm">
              This will immediately rename the attribute. You'll need to{' '}
              <strong>update your code</strong> to the new name.
            </Content>
            <TextInput
              disabled={isSystemCatalogNs}
              title={
                isSystemCatalogNs
                  ? `Attributes in the ${attr.namespace} namespace can't be edited.`
                  : undefined
              }
              value={attrName}
              onChange={(n) => setAttrName(n)}
            />
            <div className="flex flex-col gap-2 rounded py-2">
              <ActionButton
                type="submit"
                label={`Rename ${attr.name} → ${attrName}`}
                submitLabel="Renaming attribute..."
                errorMessage="Failed to rename attribute"
                disabled={
                  isSystemCatalogNs || !attrName || attrName === attr.name
                }
                title={
                  isSystemCatalogNs
                    ? `Attributes in the ${attr.namespace} namespace can't be edited.`
                    : undefined
                }
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
            isCascadeAllowed={isCascadeAllowed}
            isCascade={isCascade}
            setIsCascade={setIsCascade}
            isCascadeReverseAllowed={isCascadeReverseAllowed}
            isCascadeReverse={isCascadeReverse}
            setIsCascadeReverse={setIsCascadeReverse}
            isRequired={isRequired}
            setIsRequired={setIsRequired}
          />

          <IndexingJobError
            indexingJob={indexingJob}
            attr={attr}
            pushNavStack={pushNavStack}
            onClose={() => {
              closeDialog();
              onClose();
            }}
          />

          <div className="flex flex-col gap-6">
            <ActionButton
              disabled={!linkValidation.isValidLink}
              type="submit"
              label="Update relationship"
              submitLabel="Updating relationship..."
              errorMessage="Failed to update relationship"
              onClick={updateRef}
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
