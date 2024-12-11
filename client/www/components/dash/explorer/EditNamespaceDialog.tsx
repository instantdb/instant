import { id } from '@instantdb/core';
import { InstantReactWebDatabase } from '@instantdb/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import { errorToast, successToast } from '@/lib/toast';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  Content,
  InfoTip,
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
import { RelationshipConfigurator } from '@/components/dash/explorer/RelationshipConfigurator';
import { createJob, jobFetchLoop } from '@/lib/indexingJobs';
import { useAuthToken } from '@/lib/auth';
import type { PushNavStack } from './Explorer';
import { useClose } from '@headlessui/react';

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
    | { type: 'edit'; attrId: string }
  >({ type: 'main' });

  async function deleteNs() {
    const ops = namespace.attrs.map((attr) => ['delete-attr', attr.id]);
    await db._core._reactor.pushOps(ops);
    onClose({ ok: true });
  }

  const screenAttrId = screen.type === 'edit' ? screen.attrId : null;

  const screenAttr = useMemo(() => {
    return namespace.attrs.find((a) => a.id === screenAttrId);
  }, [screenAttrId, namespace.attrs]);

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
                    onClick={() => setScreen({ type: 'edit', attrId: attr.id })}
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
  const [isIndex, setIsIndex] = useState(false);
  const [isUniq, setIsUniq] = useState(false);
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
    setAttrName(isSelfLink ? 'children' : reverseNamespace.name);
    setReverseAttrName(isSelfLink ? 'parent' : namespace.name);
    if (isSelfLink) {
      setRelationship('many-one');
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
              <Select
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
                    value: '',
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
        ) : (
          <>&nbsp;</>
        )}
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
  job,
  attr,
  onClickSample,
}: {
  job: InstantIndexingJob | null;
  attr: SchemaAttr;
  onClickSample: (triple: InstantIndexingJobInvalidTriple) => void;
}) {
  if (!job?.invalid_triples_sample?.length) {
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
          {job.invalid_triples_sample.slice(0, 3).map((t, i) => (
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

function EditIndexed({
  appId,
  attr,
  isSystemCatalogNs,
  pushNavStack,
}: {
  appId: string;
  attr: SchemaAttr;
  isSystemCatalogNs: boolean;
  pushNavStack: PushNavStack;
}) {
  const token = useAuthToken();
  const [indexChecked, setIndexChecked] = useState(attr.isIndex);
  const [indexingJob, setIndexingJob] = useState<InstantIndexingJob | null>(
    null,
  );

  const stopFetchLoop = useRef<null | (() => void)>(null);

  useEffect(() => {
    return () => stopFetchLoop.current?.();
  }, [stopFetchLoop]);
  const updateIndexed = async () => {
    if (!token || indexChecked === attr.isIndex) {
      return;
    }
    stopFetchLoop.current?.();
    const friendlyName = `${attr.namespace}.${attr.name}`;
    try {
      const job = await createJob(
        {
          appId,
          attrId: attr.id,
          jobType: indexChecked ? 'index' : 'remove-index',
        },
        token,
      );
      setIndexingJob(job);
      const fetchLoop = jobFetchLoop(appId, job.id, token);
      stopFetchLoop.current = fetchLoop.stop;
      const finishedJob = await fetchLoop.start((data, error) => {
        if (error) {
          errorToast(`Unexpected error while indexing ${friendlyName}.`);
        }
        if (data) {
          setIndexingJob(data);
        }
      });
      if (finishedJob) {
        if (finishedJob.job_status === 'completed') {
          successToast(
            indexChecked
              ? `Indexed ${friendlyName}.`
              : `Removed index from ${friendlyName}.`,
          );
          return;
        }
        if (finishedJob.job_status === 'canceled') {
          errorToast('Indexing was canceled.');
          return;
        }
        if (finishedJob.job_status === 'errored') {
          if (finishedJob.error === 'invalid-triple-error') {
            errorToast(`Found invalid data while updating ${friendlyName}.`);
            return;
          }
          errorToast(`Encountered an error while updating ${friendlyName}.`);
        }
      }
    } catch (e) {
      console.error(e);
      errorToast(`Unexpected error while updating ${friendlyName}`);
    }
  };

  const valueNotChanged = indexChecked === attr.isIndex;

  const buttonDisabled = isSystemCatalogNs || valueNotChanged;

  const closeDialog = useClose();

  return (
    <ActionForm className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Checkbox
          disabled={isSystemCatalogNs}
          title={
            isSystemCatalogNs
              ? `Attributes in the ${attr.namespace} namespace can't be edited.`
              : undefined
          }
          checked={indexChecked}
          onChange={(enabled) => setIndexChecked(enabled)}
          label={
            <span>
              <strong>Index this attribute</strong> to improve lookup
              performance of values
            </span>
          }
        />
      </div>

      {indexingJob?.error === 'triple-too-large-error' ? (
        <div className="mt-2 mb-2 pl-2 border-l-2 border-l-red-500">
          <div>Some of the existing data is too large to index. </div>
          <InvalidTriplesSample
            job={indexingJob}
            attr={attr}
            onClickSample={(t) => {
              pushNavStack({
                namespace: attr.namespace,
                where: ['id', t.entity_id],
              });
              // It would be nice to have a way to minimize the dialog so you could go back
              closeDialog();
            }}
          />
        </div>
      ) : null}

      <ActionButton
        type="submit"
        label={
          valueNotChanged
            ? indexChecked
              ? 'Indexed'
              : 'Not indexed'
            : indexChecked
              ? 'Index attribute'
              : 'Remove index'
        }
        submitLabel={jobWorkingStatus(indexingJob) || 'Updating attribute...'}
        errorMessage="Failed to update attribute"
        disabled={buttonDisabled}
        title={
          isSystemCatalogNs
            ? `Attributes in the ${attr.namespace} namespace can't be edited.`
            : undefined
        }
        onClick={updateIndexed}
      />
    </ActionForm>
  );
}

function EditUnique({
  appId,
  attr,
  isSystemCatalogNs,
  pushNavStack,
}: {
  appId: string;
  attr: SchemaAttr;
  isSystemCatalogNs: boolean;
  pushNavStack: PushNavStack;
}) {
  const token = useAuthToken();
  const [uniqueChecked, setUniqueChecked] = useState(attr.isUniq);
  const [indexingJob, setIndexingJob] = useState<InstantIndexingJob | null>(
    null,
  );

  const stopFetchLoop = useRef<null | (() => void)>(null);

  useEffect(() => {
    return () => stopFetchLoop.current?.();
  }, [stopFetchLoop]);
  const updateUniqueness = async () => {
    if (!token || uniqueChecked === attr.isUniq) {
      return;
    }
    stopFetchLoop.current?.();
    const friendlyName = `${attr.namespace}.${attr.name}`;
    try {
      const job = await createJob(
        {
          appId,
          attrId: attr.id,
          jobType: uniqueChecked ? 'unique' : 'remove-unique',
        },
        token,
      );
      setIndexingJob(job);
      const fetchLoop = jobFetchLoop(appId, job.id, token);
      stopFetchLoop.current = fetchLoop.stop;
      const finishedJob = await fetchLoop.start((data, error) => {
        if (error) {
          errorToast(`Unexpected error while indexing ${friendlyName}.`);
        }
        if (data) {
          setIndexingJob(data);
        }
      });
      if (finishedJob) {
        if (finishedJob.job_status === 'completed') {
          successToast(
            uniqueChecked
              ? `Enforced uniqueness constraint for ${friendlyName}.`
              : `Removed uniqueness constraint from ${friendlyName}.`,
          );
          return;
        }
        if (finishedJob.job_status === 'canceled') {
          errorToast('Indexing was canceled.');
          return;
        }
        if (finishedJob.job_status === 'errored') {
          if (finishedJob.error === 'invalid-triple-error') {
            errorToast(`Found invalid data while updating ${friendlyName}.`);
            return;
          }
          errorToast(`Encountered an error while updating ${friendlyName}.`);
        }
      }
    } catch (e) {
      console.error(e);
      errorToast(`Unexpected error while updating ${friendlyName}`);
    }
  };

  const valueNotChanged = uniqueChecked === attr.isUniq;

  const buttonDisabled = isSystemCatalogNs || valueNotChanged;

  const closeDialog = useClose();

  return (
    <ActionForm className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Checkbox
          disabled={isSystemCatalogNs}
          title={
            isSystemCatalogNs
              ? `Attributes in the ${attr.namespace} namespace can't be edited.`
              : undefined
          }
          checked={uniqueChecked}
          onChange={(enabled) => setUniqueChecked(enabled)}
          label={
            <span>
              <strong>Enforce uniqueness</strong> so no two entities can have
              the same value for this attribute
            </span>
          }
        />
      </div>

      {indexingJob?.error === 'triple-not-unique-error' ? (
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
                        closeDialog();
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
            job={indexingJob}
            attr={attr}
            onClickSample={(t) => {
              pushNavStack({
                namespace: attr.namespace,
                where: ['id', t.entity_id],
              });
              // It would be nice to have a way to minimize the dialog so you could go back
              closeDialog();
            }}
          />
        </div>
      ) : null}

      {indexingJob?.error === 'triple-too-large-error' ? (
        <div className="mt-2 mb-2 pl-2 border-l-2 border-l-red-500">
          <div>Some of the existing data is too large to index. </div>
          <InvalidTriplesSample
            job={indexingJob}
            attr={attr}
            onClickSample={(t) => {
              pushNavStack({
                namespace: attr.namespace,
                where: ['id', t.entity_id],
              });
              // It would be nice to have a way to minimize the dialog so you could go back
              closeDialog();
            }}
          />
        </div>
      ) : null}

      <ActionButton
        type="submit"
        label={
          valueNotChanged
            ? uniqueChecked
              ? 'Unique'
              : 'Not unique'
            : uniqueChecked
              ? 'Add uniqueness constraint'
              : 'Remove uniqueness constraint'
        }
        submitLabel={jobWorkingStatus(indexingJob) || 'Updating attribute...'}
        errorMessage="Failed to update attribute"
        disabled={buttonDisabled}
        title={
          isSystemCatalogNs
            ? `Attributes in the ${attr.namespace} namespace can't be edited.`
            : undefined
        }
        onClick={updateUniqueness}
      />
    </ActionForm>
  );
}

function EditCheckedDataType({
  appId,
  attr,
  isSystemCatalogNs,
  pushNavStack,
}: {
  appId: string;
  attr: SchemaAttr;
  isSystemCatalogNs: boolean;
  pushNavStack: PushNavStack;
}) {
  const token = useAuthToken();
  const [checkedDataType, setCheckedDataType] = useState<
    CheckedDataType | 'any'
  >(attr.checkedDataType || 'any');
  const [indexingJob, setIndexingJob] = useState<InstantIndexingJob | null>(
    null,
  );

  const stopFetchLoop = useRef<null | (() => void)>(null);

  useEffect(() => {
    return () => stopFetchLoop.current?.();
  }, [stopFetchLoop]);
  const updateCheckedType = async () => {
    if (!token || !checkedDataType) {
      return;
    }
    stopFetchLoop.current?.();
    const friendlyName = `${attr.namespace}.${attr.name}`;
    try {
      const job = await createJob(
        {
          appId,
          attrId: attr.id,
          jobType:
            checkedDataType === 'any' ? 'remove-data-type' : 'check-data-type',
          checkedDataType: checkedDataType === 'any' ? null : checkedDataType,
        },
        token,
      );
      setIndexingJob(job);
      const fetchLoop = jobFetchLoop(appId, job.id, token);
      stopFetchLoop.current = fetchLoop.stop;
      const finishedJob = await fetchLoop.start((data, error) => {
        if (error) {
          errorToast(`Unexpected error while updating ${friendlyName}.`);
        }
        if (data) {
          setIndexingJob(data);
        }
      });
      if (finishedJob) {
        if (finishedJob.job_status === 'completed') {
          successToast(
            checkedDataType === 'any'
              ? `Removed type for ${friendlyName}.`
              : `Updated type for ${friendlyName} to ${checkedDataType}.`,
          );
          return;
        }
        if (finishedJob.job_status === 'canceled') {
          errorToast('Attribute update was canceled.');
          return;
        }
        if (finishedJob.job_status === 'errored') {
          if (finishedJob.error === 'invalid-triple-error') {
            errorToast(`Found invalid data while updating ${friendlyName}.`);
            return;
          }
          errorToast(`Encountered an error while updating ${friendlyName}.`);
        }
      }
    } catch (e) {
      console.error(e);
      errorToast(`Unexpected error while updating ${friendlyName}`);
    }
  };

  const typeNotChanged =
    checkedDataType === attr.checkedDataType ||
    ((!checkedDataType || checkedDataType === 'any') &&
      !attr.checkedDataType) ||
    (checkedDataType === indexingJob?.checked_data_type &&
      indexingJob?.job_status === 'completed');

  const buttonDisabled = isSystemCatalogNs || typeNotChanged;

  const buttonLabel = typeNotChanged
    ? `Type is ${checkedDataType}`
    : checkedDataType === 'any'
      ? 'Remove type'
      : `Set type to ${checkedDataType}`;

  const closeDialog = useClose();

  return (
    <ActionForm className="flex flex-col gap-1">
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
        <div className="flex gap-2">
          <Select
            disabled={isSystemCatalogNs}
            title={
              isSystemCatalogNs
                ? `Attributes in the ${attr.namespace} namespace can't be edited.`
                : undefined
            }
            value={checkedDataType || 'any'}
            onChange={(v) => {
              if (!v) {
                return;
              }
              const { value } = v;
              setCheckedDataType(value as CheckedDataType | 'any');
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
        </div>
      </div>
      {indexingJob?.error === 'invalid-triple-error' ? (
        <div className="mt-2 mb-2 pl-2 border-l-2 border-l-red-500">
          <div>
            The type can't be set to {indexingJob?.checked_data_type} because
            some data is the wrong type.
          </div>
          <InvalidTriplesSample
            job={indexingJob}
            attr={attr}
            onClickSample={(t) => {
              pushNavStack({
                namespace: attr.namespace,
                where: ['id', t.entity_id],
              });
              // It would be nice to have a way to minimize the dialog so you could go back
              closeDialog();
            }}
          />
        </div>
      ) : null}
      <ActionButton
        type="submit"
        label={buttonLabel}
        submitLabel={jobWorkingStatus(indexingJob) || 'Updating attribute...'}
        errorMessage="Failed to update attribute"
        disabled={buttonDisabled}
        title={
          isSystemCatalogNs
            ? `Attributes in the ${attr.namespace} namespace can't be changed.`
            : undefined
        }
        onClick={updateCheckedType}
      />
    </ActionForm>
  );
}

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
          <div className="flex flex-col gap-2">
            <h6 className="text-md font-bold">Constraints</h6>
            <EditIndexed
              appId={appId}
              attr={attr}
              isSystemCatalogNs={isSystemCatalogNs}
              pushNavStack={pushNavStack}
            />
            <EditUnique
              appId={appId}
              attr={attr}
              isSystemCatalogNs={isSystemCatalogNs}
              pushNavStack={pushNavStack}
            />
          </div>

          <EditCheckedDataType
            appId={appId}
            attr={attr}
            isSystemCatalogNs={isSystemCatalogNs}
            pushNavStack={pushNavStack}
          />
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
            ) : (
              <>&nbsp;</>
            )}
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
