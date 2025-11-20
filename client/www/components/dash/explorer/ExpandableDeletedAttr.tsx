import { Button } from '@/components/ui';
import { SchemaNamespace, DBAttr } from '@/lib/types';
import {
  relationshipConstraintsInverse,
  RelationshipKinds,
} from '@/lib/relationships';
import {
  ArrowUturnLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { add, formatDistanceToNow } from 'date-fns';
import { ReactNode } from 'react';

type SoftDeletedAttr = DBAttr & {
  'deletion-marked-at': string;
};

interface ExpandableDeletedAttrProps {
  attr: SoftDeletedAttr;
  gracePeriodDays: number;
  onRestore: (attrId: string) => void;
  isExpanded: boolean;
  setIsExpanded: (state: boolean) => void;
}

export const ExpandableDeletedAttr: React.FC<ExpandableDeletedAttrProps> = ({
  attr,
  gracePeriodDays,
  isExpanded,
  setIsExpanded,
  onRestore,
}) => {
  const date = add(new Date(attr['deletion-marked-at']), {
    days: gracePeriodDays,
  });

  const getForwardLabel = () => {
    return attr['forward-identity'][2];
  };

  const getReverseLabel = () => {
    return attr['reverse-identity']?.[2];
  };

  const getEtypes = () => {
    const forwardEtype = attr['forward-identity'][1];
    const reverseEtype = attr['reverse-identity']?.[1];
    return { forwardEtype: forwardEtype, reverseEtype };
  };

  const getRelationshipType = (): RelationshipKinds => {
    const key = `${attr.cardinality}-${attr['unique?']}`;
    return relationshipConstraintsInverse[key];
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const relationshipInfo = ((): Array<{ label: string; value: ReactNode }> => {
    if (attr['value-type'] === 'blob') {
      return [];
    }

    const relationshipType = getRelationshipType();
    const { forwardEtype: forwardEtype, reverseEtype: reverseEtype } =
      getEtypes();
    const forwardLabel = getForwardLabel();
    const reverseLabel = getReverseLabel();

    const getCardinalityText = (
      relType: RelationshipKinds,
      isForward: boolean,
    ) => {
      if (relType === 'one-one') return 'has one';
      if (relType === 'many-many') return 'has many';
      if (relType === 'one-many') return isForward ? 'has one' : 'has many';
      if (relType === 'many-one') return isForward ? 'has many' : 'has one';
      return 'has';
    };

    return [
      {
        label: 'forward',
        value: (
          <span>
            <strong>{forwardEtype}</strong>{' '}
            {getCardinalityText(relationshipType, true)}{' '}
            <strong>{forwardLabel}</strong>
          </span>
        ),
      },
      {
        label: 'reverse',
        value: (
          <span>
            <strong>{reverseEtype}</strong>{' '}
            {getCardinalityText(relationshipType, false)}{' '}
            <strong>{reverseLabel}</strong>
          </span>
        ),
      },
    ];
  })();

  const tableRows: Array<{ label: string; value: ReactNode }> = [
    { label: 'type', value: attr['value-type'] },
    ...relationshipInfo,
  ];

  return (
    <div>
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDownIcon width={14} className="text-gray-400" />
          ) : (
            <ChevronRightIcon width={14} className="text-gray-400" />
          )}
          <span className="font-mono text-sm font-medium">
            {attr['forward-identity'][2]}
          </span>
          <span className="font-mono text-xs text-gray-400">
            expires {formatDistanceToNow(date, { includeSeconds: false })}
          </span>
        </div>
        <Button
          className="px-1"
          size="mini"
          variant="subtle"
          onClick={(e) => {
            e.stopPropagation();
            onRestore(attr.id);
          }}
        >
          <ArrowUturnLeftIcon width={14} />
          Restore
        </Button>
      </div>

      {isExpanded && (
        <div className="pb-3 pl-6">
          <table className="mt-2 w-full text-left font-mono text-xs text-gray-500">
            <tbody>
              {tableRows.map((row, index) => (
                <tr
                  key={row.label}
                  className={
                    index === tableRows.length - 1
                      ? 'pl-2'
                      : 'border-b border-gray-200'
                  }
                >
                  <td className="py-1 pl-2 pr-4 font-medium text-gray-700">
                    {row.label}
                  </td>
                  <td className="py-1 text-gray-600">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
