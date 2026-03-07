'use client';

import { useState, useCallback, ReactNode } from 'react';
import { demoLists, AppDemo } from './SyncRelationsAppDemo';
import type { List } from './SyncRelationsAppDemo';

// -- Entity labels -----------------------------------------------------------

type EntityName = 'lists' | 'items' | 'comments';

const entityStyles: Record<
  EntityName,
  { idle: string; active: string; dot: string }
> = {
  lists: {
    idle: 'border-purple-200 bg-purple-50 text-purple-400',
    active: 'border-purple-300 bg-purple-100 text-purple-700 shadow-sm',
    dot: 'bg-purple-400',
  },
  items: {
    idle: 'border-orange-200 bg-orange-50 text-orange-400',
    active: 'border-orange-300 bg-orange-100 text-orange-700 shadow-sm',
    dot: 'bg-orange-400',
  },
  comments: {
    idle: 'border-green-200 bg-green-50 text-green-400',
    active: 'border-green-300 bg-green-100 text-green-700 shadow-sm',
    dot: 'bg-green-400',
  },
};

function EntityLabel({ name, active }: { name: EntityName; active: boolean }) {
  const s = entityStyles[name];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-300 ${
        active ? s.active : s.idle
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
          active ? s.dot : 'bg-gray-300'
        }`}
      />
      {name}
    </span>
  );
}

// -- Query code block with entity-colored highlighting -----------------------

function QueryLine({
  children,
  indent = 0,
  entity,
  activeEntity,
}: {
  children: ReactNode;
  indent?: number;
  entity?: EntityName;
  activeEntity?: EntityName;
}) {
  const isActive = entity && entity === activeEntity;
  const isAncestor =
    entity &&
    activeEntity &&
    entityOrder.indexOf(entity) < entityOrder.indexOf(activeEntity);
  const borderColor = entity
    ? {
        lists: 'border-purple-400',
        items: 'border-orange-400',
        comments: 'border-green-400',
      }[entity]
    : '';

  return (
    <div
      className={`rounded px-2 py-0.5 transition-all duration-300 ${
        isActive
          ? `border-l-2 ${borderColor} bg-gray-800/80`
          : isAncestor
            ? `border-l-2 ${borderColor}/30 bg-gray-800/30`
            : 'border-l-2 border-transparent'
      }`}
      style={{ paddingLeft: `${indent * 20 + 8}px` }}
    >
      {children}
    </div>
  );
}

const entityOrder: EntityName[] = ['lists', 'items', 'comments'];

function entityTextClass(entity: EntityName, activeEntity: EntityName): string {
  const isActive =
    entityOrder.indexOf(entity) <= entityOrder.indexOf(activeEntity);
  if (!isActive) return 'text-gray-600';
  return {
    lists: 'text-purple-400',
    items: 'text-orange-400',
    comments: 'text-green-400',
  }[entity];
}

function QueryCodeBlock({ activeEntity }: { activeEntity: EntityName }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#0D1117] p-5">
      <div className="mb-3 text-[11px] font-medium text-gray-500">InstaQL</div>
      <div className="font-mono text-[13px] leading-relaxed">
        <QueryLine>
          <span className="text-purple-400">const</span>{' '}
          <span className="text-gray-300">query</span>{' '}
          <span className="text-gray-500">=</span>{' '}
          <span className="text-gray-500">{'{'}</span>
        </QueryLine>
        <QueryLine indent={1} entity="lists" activeEntity={activeEntity}>
          <span className={entityTextClass('lists', activeEntity)}>lists</span>
          <span className="text-gray-500">{': {'}</span>
        </QueryLine>
        <QueryLine indent={2} entity="items" activeEntity={activeEntity}>
          <span className={entityTextClass('items', activeEntity)}>items</span>
          <span className="text-gray-500">{': {'}</span>
        </QueryLine>
        <QueryLine indent={3} entity="comments" activeEntity={activeEntity}>
          <span className={entityTextClass('comments', activeEntity)}>
            comments
          </span>
          <span className="text-gray-500">{': {}'}</span>
        </QueryLine>
        <QueryLine indent={2}>
          <span className="text-gray-500">{'}'}</span>
        </QueryLine>
        <QueryLine indent={1}>
          <span className="text-gray-500">{'}'}</span>
        </QueryLine>
        <QueryLine>
          <span className="text-gray-500">{'}'}</span>
        </QueryLine>
      </div>
    </div>
  );
}

// -- Main variant component --------------------------------------------------

export function SyncRelationsV2() {
  const [lists, setLists] = useState<List[]>(demoLists);
  const [activeListId, setActiveListId] = useState(1);
  const [activeItemId, setActiveItemId] = useState<number | null>(1);

  const activeList = lists.find((l) => l.id === activeListId)!;
  const activeItem = activeItemId
    ? (activeList.items.find((i) => i.id === activeItemId) ?? null)
    : null;

  const activeEntity: EntityName =
    activeItem && activeItem.comments.length > 0 ? 'comments' : 'items';

  const handleSelectList = useCallback((id: number) => {
    setActiveListId(id);
    setActiveItemId(null);
  }, []);

  const handleToggleItem = useCallback(
    (itemId: number) => {
      setLists((prev) =>
        prev.map((l) =>
          l.id === activeListId
            ? {
                ...l,
                items: l.items.map((i) =>
                  i.id === itemId ? { ...i, done: !i.done } : i,
                ),
              }
            : l,
        ),
      );
    },
    [activeListId],
  );

  return (
    <div className="space-y-4">
      {/* Entity labels aligned above demo panels */}
      <div className="flex">
        <div className="flex w-36 items-center justify-center sm:w-[240px]">
          <EntityLabel name="lists" active={true} />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <EntityLabel name="items" active={true} />
        </div>
        {activeItem && (
          <div className="hidden items-center justify-center sm:flex sm:w-52">
            <EntityLabel
              name="comments"
              active={activeItem.comments.length > 0}
            />
          </div>
        )}
      </div>

      {/* App demo */}
      <AppDemo
        lists={lists}
        activeListId={activeListId}
        activeItemId={activeItemId}
        onSelectList={handleSelectList}
        onSelectItem={setActiveItemId}
        onToggleItem={handleToggleItem}
      />

      {/* Query block */}
      <QueryCodeBlock activeEntity={activeEntity} />
    </div>
  );
}
