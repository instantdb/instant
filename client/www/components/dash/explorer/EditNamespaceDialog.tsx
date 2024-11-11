import { id } from '@instantdb/core';
import { InstantReactWeb } from '@instantdb/react';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import { errorToast, successToast } from '@/lib/toast';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  Content,
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
  pushNavStack,
}: {
  db: InstantReactWeb;
  appId: string;
  namespace: SchemaNamespace;
  namespaces: SchemaNamespace[];
  onClose: (p?: { ok: boolean }) => void;
  readOnly: boolean;
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
              disabled={readOnly}
              title={
                readOnly
                  ? `The ${namespace.name} namespace is read-only.`
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
              disabled={readOnly}
              title={
                readOnly
                  ? `The ${namespace.name} namespace is read-only.`
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
          readOnly={readOnly}
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
  db: InstantReactWeb;
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

function EditCheckedDataType({
  appId,
  attr,
  readOnly,
  pushNavStack,
}: {
  appId: string;
  attr: SchemaAttr;
  readOnly: boolean;
  pushNavStack: PushNavStack;
}) {
  //const closeDialog = useClose();
  const token = useAuthToken();
  const [checkedDataType, setCheckedDataType] = useState<
    CheckedDataType | undefined | 'any'
  >(attr.checkedDataType);
  const [indexingJob, setIndexingJob] = useState<InstantIndexingJob | null>(
    null,
  );
  const updateCheckedType = async () => {
    if (!token || !checkedDataType) {
      // XXX: Some error
      return;
    }
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
      const finishedJob = await fetchLoop.start((data, error) => {
        if (error) {
          // Handle error
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
          errorToast('Attribute updated was canceled.');
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
      // handle error
    }
  };

  const typeNotChanged =
    checkedDataType === attr.checkedDataType ||
    ((!checkedDataType || checkedDataType === 'any') &&
      !attr.checkedDataType) ||
    (checkedDataType === indexingJob?.checked_data_type &&
      indexingJob?.job_status === 'completed');

  const buttonDisabled = readOnly || typeNotChanged;

  const buttonLabel = typeNotChanged
    ? `Type is ${checkedDataType}`
    : checkedDataType === 'any'
      ? 'Remove type'
      : `Set type to ${checkedDataType}`;

  const closeDialog = useClose();

  return (
    <ActionForm className="flex flex-col gap-1">
      <div className="flex flex-col gap-2">
        <h6 className="text-md font-bold">Enforce type</h6>
        <div className="flex gap-2">
          <Select
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
          {indexingJob?.invalid_triples_sample?.length ? (
            <div>
              Here are the first few invalid entities we found:
              <table className="mx-2 my-2 flex-1 text-left font-mono text-xs text-gray-500">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="pr-2">id</th>
                    <th className="pr-2">{attr.name}</th>
                    <th className="pr-2">type</th>
                  </tr>
                </thead>
                <tbody>
                  {indexingJob.invalid_triples_sample
                    .slice(0, 3)
                    .map((t, i) => (
                      <tr
                        key={i}
                        className="cursor-pointer whitespace-nowrap rounded-md px-2 hover:bg-gray-200"
                        onClick={() => {
                          pushNavStack({
                            namespace: attr.namespace,
                            where: ['id', t.entity_id],
                          });
                          // It would be nice to have a way to minimize the dialog so you could go back
                          closeDialog();
                        }}
                      >
                        <td className="pr-2">
                          <pre>{t.entity_id}</pre>
                        </td>
                        <td className="pr-2">{t.value}</td>
                        <td className="pr-2">{t.json_type}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
      <ActionButton
        type="submit"
        label={buttonLabel}
        submitLabel={jobWorkingStatus(indexingJob) || 'Updating attribute...'}
        errorMessage="Failed to update attribute"
        disabled={buttonDisabled}
        title={
          readOnly ? `The ${attr.namespace} namespace is read-only.` : undefined
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
  readOnly,
  pushNavStack,
}: {
  db: InstantReactWeb;
  appId: string;
  attr: SchemaAttr;
  onClose: () => void;
  readOnly: boolean;
  pushNavStack: PushNavStack;
}) {
  const [screen, setScreen] = useState<{ type: 'main' } | { type: 'delete' }>({
    type: 'main',
  });

  const [attrName, setAttrName] = useState(attr.linkConfig.forward.attr);
  const [reverseAttrName, setReverseAttrName] = useState(
    attr.linkConfig.reverse?.attr,
  );
  const [attrConfig, setAttrConfig] = useState<SchemaAttr>(attr);
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

  useEffect(() => {
    setAttrConfig(attr);
  }, [attr]);

  async function updateBlob() {
    const ops = [
      [
        'update-attr',
        {
          id: attr.id,
          'index?': attrConfig.isIndex,
          'unique?': attrConfig.isUniq,
          cardinality: attrConfig.cardinality,
        },
      ],
    ];

    await db._core._reactor.pushOps(ops);

    successToast('Updated attribute');
  }

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
          disabled={readOnly && attr.type !== 'ref'}
          title={
            readOnly && attr.type !== 'ref'
              ? `The ${attr.namespace} namespace is read-only.`
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
          <ActionForm className="flex flex-col gap-2">
            <div className="flex flex-col gap-2">
              <h6 className="text-md font-bold">Constraints</h6>
              <div className="flex gap-2">
                <Checkbox
                  disabled={readOnly}
                  title={
                    readOnly
                      ? `The ${attr.namespace} namespace is read-only.`
                      : undefined
                  }
                  checked={attrConfig.isIndex}
                  onChange={(enabled) =>
                    setAttrConfig((c) => ({ ...c, isIndex: enabled }))
                  }
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
                  disabled={readOnly}
                  title={
                    readOnly
                      ? `The ${attr.namespace} namespace is read-only.`
                      : undefined
                  }
                  checked={attrConfig.isUniq}
                  onChange={(enabled) =>
                    setAttrConfig((c) => ({ ...c, isUniq: enabled }))
                  }
                  label={
                    <span>
                      <strong>Enforce uniqueness</strong> so no two entities can
                      have the same value for this attribute
                    </span>
                  }
                />
              </div>
              <ActionButton
                type="submit"
                label={`Update ${attr.name}`}
                submitLabel="Updating attribute..."
                errorMessage="Failed to update attribute"
                disabled={readOnly || !attrName}
                title={
                  readOnly
                    ? `The ${attr.namespace} namespace is read-only.`
                    : undefined
                }
                onClick={updateBlob}
              />
            </div>
          </ActionForm>
          <EditCheckedDataType
            appId={appId}
            attr={attr}
            readOnly={readOnly}
            pushNavStack={pushNavStack}
          />
          <ActionForm className="flex flex-col gap-1">
            <h6 className="text-md font-bold">Rename</h6>
            <Content className="text-sm">
              This will immediately rename the attribute. You'll need to{' '}
              <strong>update your code</strong> to the new name.
            </Content>
            <TextInput
              disabled={readOnly}
              title={
                readOnly
                  ? `The ${attr.namespace} namespace is read-only.`
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
                disabled={readOnly || !attrName || attrName === attr.name}
                title={
                  readOnly
                    ? `The ${attr.namespace} namespace is read-only.`
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
