'use client';

import { ReactNode } from 'react';

// -- Shared types & data for all SyncRelations variants ----------------------

export type Item = {
  id: number;
  text: string;
  done: boolean;
  comments: { id: number; user: string; text: string }[];
};

export type List = {
  id: number;
  name: string;
  emoji: string;
  items: Item[];
};

export const demoLists: List[] = [
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

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
      />
    </svg>
  );
}

// -- Controlled demo body (no card wrapper) ----------------------------------

export function AppDemoBody({
  lists,
  activeListId,
  activeItemId,
  onSelectList,
  onSelectItem,
  onToggleItem,
}: {
  lists: List[];
  activeListId: number;
  activeItemId: number | null;
  onSelectList: (id: number) => void;
  onSelectItem: (id: number) => void;
  onToggleItem: (id: number) => void;
}) {
  const activeList = lists.find((l) => l.id === activeListId)!;
  const activeItem = activeItemId
    ? (activeList.items.find((i) => i.id === activeItemId) ?? null)
    : null;
  const doneCount = activeList.items.filter((i) => i.done).length;
  const totalCount = activeList.items.length;

  return (
    <>
      <div className="flex min-h-[320px]">
        {/* Sidebar: Lists */}
        <div className="w-36 border-r border-gray-100 bg-gray-50/50 p-2 sm:w-[240px]">
          <div className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
            Lists
          </div>
          {lists.map((l) => {
            const done = l.items.filter((i) => i.done).length;
            return (
              <button
                key={l.id}
                onClick={() => onSelectList(l.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                  activeListId === l.id
                    ? 'border border-gray-200 bg-white shadow-sm'
                    : 'text-gray-600 hover:bg-white/60'
                }`}
              >
                <span>{l.emoji}</span>
                <span className="flex-1 truncate text-xs font-medium">
                  {l.name}
                </span>
                <span className="text-[10px] text-gray-400">
                  {done}/{l.items.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main: Items */}
        <div className="flex flex-1">
          <div
            className={`flex-1 p-3 ${activeItem ? 'border-r border-gray-100' : ''}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">
                {activeList.emoji} {activeList.name}
              </span>
              <span className="text-xs text-gray-400">
                {doneCount}/{totalCount}
              </span>
            </div>
            <div className="space-y-1">
              {activeList.items.map((item) => (
                <div
                  key={item.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                    activeItemId === item.id
                      ? 'border border-orange-200 bg-orange-50'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => onSelectItem(item.id)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleItem(item.id);
                    }}
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                      item.done
                        ? 'border-orange-600 bg-orange-600'
                        : 'border-gray-300'
                    }`}
                  >
                    {item.done && (
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
                  <span
                    className={`flex-1 text-xs ${
                      item.done ? 'text-gray-400 line-through' : 'text-gray-700'
                    }`}
                  >
                    {item.text}
                  </span>
                  {item.comments.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                      <CommentIcon className="h-3 w-3" />
                      {item.comments.length}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Comments (desktop) */}
          {activeItem && (
            <div className="hidden w-44 p-3 sm:block sm:w-52">
              <div className="mb-2 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
                Comments
              </div>
              {activeItem.comments.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No comments yet</p>
              ) : (
                <div className="space-y-2.5">
                  {activeItem.comments.map((c) => (
                    <div key={c.id}>
                      <span className="text-xs font-semibold text-gray-700">
                        {c.user}
                      </span>
                      <p className="mt-0.5 text-xs">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Comments (mobile) */}
      <div className="h-[88px] overflow-hidden border-t border-gray-100 p-3 sm:hidden">
        <div
          className={`transition-opacity duration-200 ${activeItem ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="mb-2 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
            Comments
          </div>
          {!activeItem || activeItem.comments.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No comments yet</p>
          ) : (
            <div className="space-y-2.5">
              {activeItem.comments.map((c) => (
                <div key={c.id}>
                  <span className="text-xs font-semibold text-gray-700">
                    {c.user}
                  </span>
                  <p className="mt-0.5 text-xs">{c.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// -- Full card component with top bar ----------------------------------------

export function AppDemo({
  lists,
  activeListId,
  activeItemId,
  onSelectList,
  onSelectItem,
  onToggleItem,
  topBar,
}: {
  lists: List[];
  activeListId: number;
  activeItemId: number | null;
  onSelectList: (id: number) => void;
  onSelectItem: (id: number) => void;
  onToggleItem: (id: number) => void;
  topBar?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm **:text-[16px]">
      {topBar !== undefined ? (
        topBar
      ) : (
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <span className="text-xs font-medium opacity-70">Project Board</span>
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Live
          </span>
        </div>
      )}
      <AppDemoBody
        lists={lists}
        activeListId={activeListId}
        activeItemId={activeItemId}
        onSelectList={onSelectList}
        onSelectItem={onSelectItem}
        onToggleItem={onToggleItem}
      />
    </div>
  );
}
