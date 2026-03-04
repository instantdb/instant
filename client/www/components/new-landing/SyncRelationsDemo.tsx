'use client';

import { useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// -- Types --------------------------------------------------------------------

type DemoState = {
  view: 'lists' | 'items';
  activeListId: number | null;
  activeItemId: number | null;
  hideCompleted: boolean;
};

type Item = {
  id: number;
  text: string;
  done: boolean;
  comments: { id: number; user: string; text: string }[];
};

type List = {
  id: number;
  name: string;
  emoji: string;
  items: Item[];
};

const demoLists: List[] = [
  {
    id: 1,
    name: 'Launch',
    emoji: '🚀',
    items: [
      {
        id: 1,
        text: 'Finalize landing page',
        done: true,
        comments: [{ id: 1, user: 'Alice', text: 'Looks great!' }],
      },
      {
        id: 2,
        text: 'Set up auth providers',
        done: true,
        comments: [
          { id: 10, user: 'Bob', text: 'Google and GitHub are live' },
          { id: 11, user: 'Carol', text: 'Nice, testing now' },
        ],
      },
      {
        id: 3,
        text: 'Write announcement post',
        done: false,
        comments: [{ id: 2, user: 'Bob', text: 'Draft is ready for review' }],
      },
    ],
  },
  {
    id: 2,
    name: 'Design',
    emoji: '🎨',
    items: [
      {
        id: 4,
        text: 'Update color palette',
        done: false,
        comments: [{ id: 3, user: 'Carol', text: 'Love the new orange' }],
      },
      {
        id: 5,
        text: 'Mobile responsive pass',
        done: false,
        comments: [],
      },
    ],
  },
  {
    id: 3,
    name: 'Backend',
    emoji: '⚡',
    items: [
      {
        id: 6,
        text: 'Add rate limiting',
        done: false,
        comments: [],
      },
      {
        id: 7,
        text: 'Optimize queries',
        done: true,
        comments: [{ id: 4, user: 'Dave', text: '3x faster now' }],
      },
    ],
  },
];

// -- Syntax highlighting primitives -------------------------------------------

function Kw({ children }: { children: ReactNode }) {
  return <span className="text-purple-400">{children}</span>;
}

function Ent({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={active ? 'text-orange-300' : 'text-gray-300'}>
      {children}
    </span>
  );
}

function Pn({ children }: { children: ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function Str({ children }: { children: ReactNode }) {
  return <span className="text-green-400">{children}</span>;
}

// -- Dynamic query code block -------------------------------------------------

type QL = {
  key: string;
  indent: number;
  content: ReactNode;
  highlight?: boolean;
};

function buildQueryLines(state: DemoState, lists: List[]): QL[] {
  const lines: QL[] = [];
  const activeList = state.activeListId
    ? lists.find((l) => l.id === state.activeListId)
    : null;
  const activeItem =
    state.activeItemId && activeList
      ? (activeList.items.find((i) => i.id === state.activeItemId) ?? null)
      : null;
  const showComments = !!(activeItem && activeItem.comments.length > 0);

  // const query = {
  lines.push({
    key: 'decl',
    indent: 0,
    content: (
      <>
        <Kw>const</Kw> <span className="text-gray-300">query</span> <Pn>=</Pn>{' '}
        <Pn>{'{'}</Pn>
      </>
    ),
  });

  if (state.view === 'lists') {
    lines.push({
      key: 'lists-leaf',
      indent: 1,
      content: (
        <>
          <Ent active>lists</Ent>
          <Pn>{': {}'}</Pn>
        </>
      ),
      highlight: true,
    });
  } else {
    // lists: {
    lines.push({
      key: 'lists-open',
      indent: 1,
      content: (
        <>
          <Ent active>lists</Ent>
          <Pn>{': {'}</Pn>
        </>
      ),
      highlight: true,
    });

    // $: { where: { name: "Launch" } },
    lines.push({
      key: 'lists-where',
      indent: 2,
      content: (
        <>
          <Pn>$</Pn>
          <Pn>{': { '}</Pn>
          <Ent active>where</Ent>
          <Pn>{': { '}</Pn>
          <Ent>name</Ent>
          <Pn>{': '}</Pn>
          <Str>{`"${activeList?.name}"`}</Str>
          <Pn>{' } },'}</Pn>
        </>
      ),
      highlight: true,
    });

    const itemsHasBody = state.hideCompleted || showComments;

    if (!itemsHasBody) {
      // items: {}
      lines.push({
        key: 'items-leaf',
        indent: 2,
        content: (
          <>
            <Ent active>items</Ent>
            <Pn>{': {}'}</Pn>
          </>
        ),
        highlight: true,
      });
    } else {
      // items: {
      lines.push({
        key: 'items-open',
        indent: 2,
        content: (
          <>
            <Ent active>items</Ent>
            <Pn>{': {'}</Pn>
          </>
        ),
        highlight: true,
      });

      if (state.hideCompleted) {
        // $: { where: { done: false } }
        lines.push({
          key: 'items-where',
          indent: 3,
          content: (
            <>
              <Pn>$</Pn>
              <Pn>{': { '}</Pn>
              <Ent active>where</Ent>
              <Pn>{': { '}</Pn>
              <Ent>done</Ent>
              <Pn>{': '}</Pn>
              <span className="text-blue-400">false</span>
              <Pn>{` } }${showComments ? ',' : ''}`}</Pn>
            </>
          ),
          highlight: true,
        });
      }

      if (showComments) {
        // comments: {}
        lines.push({
          key: 'comments-leaf',
          indent: 3,
          content: (
            <>
              <Ent active>comments</Ent>
              <Pn>{': {}'}</Pn>
            </>
          ),
          highlight: true,
        });
      }

      // close items
      lines.push({
        key: 'items-close',
        indent: 2,
        content: <Pn>{'}'}</Pn>,
      });
    }

    // close lists
    lines.push({
      key: 'lists-close',
      indent: 1,
      content: <Pn>{'}'}</Pn>,
    });
  }

  // close query
  lines.push({
    key: 'close',
    indent: 0,
    content: <Pn>{'}'}</Pn>,
  });

  return lines;
}

function QueryCodeBlock({ state, lists }: { state: DemoState; lists: List[] }) {
  const queryLines = buildQueryLines(state, lists);

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-[#0D1117]">
      <div className="border-b border-gray-800 px-4 py-2.5 text-[11px] font-medium text-gray-500">
        InstaQL
      </div>
      <div className="flex-1 p-4 font-mono text-[13px] leading-relaxed">
        <AnimatePresence initial={false}>
          {queryLines.map((line) => (
            <motion.div
              key={line.key}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div
                className={`rounded px-2 py-0.5 ${
                  line.highlight
                    ? 'border-l-2 border-orange-400/30 bg-orange-500/5'
                    : 'border-l-2 border-transparent'
                }`}
                style={{ paddingLeft: `${line.indent * 20 + 8}px` }}
              >
                {line.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// -- App mock components ------------------------------------------------------

function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
        checked ? 'border-orange-600 bg-orange-600' : 'border-gray-300'
      }`}
    >
      {checked && (
        <svg
          className="h-2.5 w-2.5 text-white"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={3}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m4.5 12.75 6 6 9-13.5"
          />
        </svg>
      )}
    </button>
  );
}

function ListsView({
  lists,
  onSelectList,
}: {
  lists: List[];
  onSelectList: (id: number) => void;
}) {
  return (
    <div className="space-y-1 p-3">
      {lists.map((l) => {
        const done = l.items.filter((i) => i.done).length;
        return (
          <button
            key={l.id}
            onClick={() => onSelectList(l.id)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
          >
            <span className="text-base">{l.emoji}</span>
            <span className="flex-1 text-sm font-medium text-gray-800">
              {l.name}
            </span>
            <span className="text-xs text-gray-400">
              {done}/{l.items.length}
            </span>
            <span className="text-gray-300">›</span>
          </button>
        );
      })}
    </div>
  );
}

function ItemsView({
  list,
  activeItemId,
  hideCompleted,
  onBack,
  onToggleItem,
  onSelectItem,
  onToggleHideCompleted,
}: {
  list: List;
  activeItemId: number | null;
  hideCompleted: boolean;
  onBack: () => void;
  onToggleItem: (id: number) => void;
  onSelectItem: (id: number | null) => void;
  onToggleHideCompleted: () => void;
}) {
  const visibleItems = hideCompleted
    ? list.items.filter((i) => !i.done)
    : list.items;

  return (
    <div className="flex flex-col">
      {/* Header with back button + hide completed toggle */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <button
          onClick={onBack}
          className="text-xs text-gray-400 transition-colors hover:text-gray-600"
        >
          ← Lists
        </button>
        <span className="text-sm font-semibold">
          {list.emoji} {list.name}
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-400">
          Hide completed
          <button
            onClick={onToggleHideCompleted}
            className={`relative h-4 w-7 rounded-full transition-colors ${
              hideCompleted ? 'bg-orange-500' : 'bg-gray-200'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                hideCompleted ? 'translate-x-3' : ''
              }`}
            />
          </button>
        </label>
      </div>

      {/* Item rows */}
      <div className="flex-1 space-y-0.5 p-3">
        <AnimatePresence initial={false}>
          {visibleItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                  activeItemId === item.id ? 'bg-orange-50' : 'hover:bg-gray-50'
                }`}
                onClick={() =>
                  onSelectItem(activeItemId === item.id ? null : item.id)
                }
              >
                <Checkbox
                  checked={item.done}
                  onChange={() => onToggleItem(item.id)}
                />
                <span
                  className={`flex-1 text-xs ${
                    item.done ? 'text-gray-400 line-through' : 'text-gray-700'
                  }`}
                >
                  {item.text}
                </span>
                {item.comments.length > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                    💬 {item.comments.length}
                  </span>
                )}
              </div>

              {/* Inline comments (accordion) */}
              <AnimatePresence>
                {activeItemId === item.id && item.comments.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 mb-2 ml-6 space-y-2 rounded-lg bg-gray-50 p-2.5">
                      {item.comments.map((c) => (
                        <div key={c.id} className="flex gap-2">
                          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-500">
                            {c.user[0]}
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold text-gray-600">
                              {c.user}
                            </span>
                            <p className="text-[11px] text-gray-500">
                              {c.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AppMock({
  state,
  lists,
  onSelectList,
  onBack,
  onToggleItem,
  onSelectItem,
  onToggleHideCompleted,
}: {
  state: DemoState;
  lists: List[];
  onSelectList: (id: number) => void;
  onBack: () => void;
  onToggleItem: (id: number) => void;
  onSelectItem: (id: number | null) => void;
  onToggleHideCompleted: () => void;
}) {
  const activeList = lists.find((l) => l.id === state.activeListId);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <span className="text-xs font-medium opacity-70">Project Board</span>
        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Live
        </span>
      </div>
      <div className="relative min-h-[280px]">
        <AnimatePresence mode="wait" initial={false}>
          {state.view === 'lists' ? (
            <motion.div
              key="lists"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <ListsView lists={lists} onSelectList={onSelectList} />
            </motion.div>
          ) : activeList ? (
            <motion.div
              key="items"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <ItemsView
                list={activeList}
                activeItemId={state.activeItemId}
                hideCompleted={state.hideCompleted}
                onBack={onBack}
                onToggleItem={onToggleItem}
                onSelectItem={onSelectItem}
                onToggleHideCompleted={onToggleHideCompleted}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// -- Main component -----------------------------------------------------------

export function SyncRelationsDemo() {
  const [lists, setLists] = useState<List[]>(demoLists);
  const [state, setState] = useState<DemoState>({
    view: 'lists',
    activeListId: null,
    activeItemId: null,
    hideCompleted: false,
  });

  const handleSelectList = useCallback((id: number) => {
    setState((s) => ({
      ...s,
      view: 'items',
      activeListId: id,
      activeItemId: null,
    }));
  }, []);

  const handleBack = useCallback(() => {
    setState({
      view: 'lists',
      activeListId: null,
      activeItemId: null,
      hideCompleted: false,
    });
  }, []);

  const handleToggleItem = useCallback(
    (itemId: number) => {
      const list = lists.find((l) => l.id === state.activeListId);
      const item = list?.items.find((i) => i.id === itemId);
      const willBeDone = item ? !item.done : false;

      setLists((prev) =>
        prev.map((l) =>
          l.id === state.activeListId
            ? {
                ...l,
                items: l.items.map((i) =>
                  i.id === itemId ? { ...i, done: !i.done } : i,
                ),
              }
            : l,
        ),
      );

      // If the toggled item will be hidden, deselect it
      if (state.hideCompleted && willBeDone && state.activeItemId === itemId) {
        setState((s) => ({ ...s, activeItemId: null }));
      }
    },
    [state.activeListId, state.hideCompleted, state.activeItemId, lists],
  );

  const handleSelectItem = useCallback((id: number | null) => {
    setState((s) => ({ ...s, activeItemId: id }));
  }, []);

  const handleToggleHideCompleted = useCallback(() => {
    setState((s) => ({
      ...s,
      hideCompleted: !s.hideCompleted,
      activeItemId: null,
    }));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <AppMock
        state={state}
        lists={lists}
        onSelectList={handleSelectList}
        onBack={handleBack}
        onToggleItem={handleToggleItem}
        onSelectItem={handleSelectItem}
        onToggleHideCompleted={handleToggleHideCompleted}
      />
      <QueryCodeBlock state={state} lists={lists} />
    </div>
  );
}
