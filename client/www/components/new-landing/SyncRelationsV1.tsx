'use client';

import { useState, useCallback, ReactNode } from 'react';
import { demoLists, AppDemo } from './SyncRelationsAppDemo';
import type { List } from './SyncRelationsAppDemo';

// -- Query code block with depth-based highlighting --------------------------

function QLine({
  children,
  indent = 0,
  highlight,
  active,
}: {
  children: ReactNode;
  indent?: number;
  highlight?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded px-2 py-0.5 transition-all duration-300 ${
        active
          ? 'border-l-2 border-orange-400 bg-orange-500/15'
          : highlight
            ? 'border-l-2 border-orange-400/30 bg-orange-500/5'
            : 'border-l-2 border-transparent'
      }`}
      style={{ paddingLeft: `${indent * 20 + 8}px` }}
    >
      {children}
    </div>
  );
}

function Kw({ children }: { children: ReactNode }) {
  return <span className="text-purple-400">{children}</span>;
}

function Ent({
  children,
  active,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span className={active ? 'text-orange-300' : 'text-gray-500'}>
      {children}
    </span>
  );
}

function Pn({ children }: { children: ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function QueryCodeBlock({ depth }: { depth: number }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-[#0D1117]">
      <div className="border-b border-gray-800 px-4 py-2.5 text-[11px] font-medium text-gray-500">
        InstaQL
      </div>
      <div className="flex-1 p-4 font-mono text-[13px] leading-relaxed">
        <QLine>
          <Kw>const</Kw> <span className="text-gray-300">query</span>{' '}
          <Pn>=</Pn> <Pn>{'{'}</Pn>
        </QLine>
        <QLine indent={1} highlight={depth >= 1} active={depth === 1}>
          <Ent active={depth >= 1}>lists</Ent>
          <Pn>{': {'}</Pn>
        </QLine>
        <QLine indent={2} highlight={depth >= 2} active={depth === 2}>
          <Ent active={depth >= 2}>items</Ent>
          <Pn>{': {'}</Pn>
        </QLine>
        <QLine indent={3} highlight={depth >= 3} active={depth === 3}>
          <Ent active={depth >= 3}>comments</Ent>
          <Pn>{': {}'}</Pn>
        </QLine>
        <QLine indent={2}>
          <Pn>{'}'}</Pn>
        </QLine>
        <QLine indent={1}>
          <Pn>{'}'}</Pn>
        </QLine>
        <QLine>
          <Pn>{'}'}</Pn>
        </QLine>

        <div className="mt-6 space-y-1 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-orange-400" />
            <span>Click a list to see items</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-orange-400/40" />
            <span>Click an item to see comments</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Main variant component --------------------------------------------------

export function SyncRelationsV1() {
  const [lists, setLists] = useState<List[]>(demoLists);
  const [activeListId, setActiveListId] = useState(1);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);

  const activeList = lists.find((l) => l.id === activeListId)!;
  const activeItem = activeItemId
    ? (activeList.items.find((i) => i.id === activeItemId) ?? null)
    : null;

  const depth =
    activeItem && activeItem.comments.length > 0
      ? 3
      : activeItemId
        ? 2
        : 1;

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <AppDemo
        lists={lists}
        activeListId={activeListId}
        activeItemId={activeItemId}
        onSelectList={handleSelectList}
        onSelectItem={setActiveItemId}
        onToggleItem={handleToggleItem}
      />
      <QueryCodeBlock depth={depth} />
    </div>
  );
}
