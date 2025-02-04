import { Select, TextInput } from '@/components/ui';
import { RelationshipKinds } from '@/lib/relationships';
import { ReactNode } from 'react';

export function RelationshipConfigurator({
  attrName,
  reverseAttrName,
  namespaceName,
  reverseNamespaceName,
  relationship,
  setAttrName,
  setReverseAttrName,
  setRelationship,
}: {
  relationship: RelationshipKinds;
  reverseNamespaceName: string | undefined;
  attrName: string;
  reverseAttrName: string;
  namespaceName: string;

  setAttrName: (n: string) => void;
  setReverseAttrName: (n: string) => void;
  setRelationship: (n: RelationshipKinds) => void;
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
    </>
  );
}

export function RelationshipSelect({
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

export const relationshipDescriptions: Record<
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
