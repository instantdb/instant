'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { demoLists, AppDemoBody } from './SyncRelationsAppDemo';
import type { List } from './SyncRelationsAppDemo';

// -- Query view with annotations + JSON preview ------------------------------

function QueryView({ lists }: { lists: List[] }) {
  const totalItems = lists.reduce((sum, l) => sum + l.items.length, 0);
  const totalComments = lists.reduce(
    (sum, l) =>
      sum + l.items.reduce((s, i) => s + i.comments.length, 0),
    0,
  );

  const jsonPreview = JSON.stringify(
    {
      lists: lists.map((l) => ({
        name: l.name,
        items: l.items.map((i) => ({
          text: i.text,
          done: i.done,
          comments: i.comments.map((c) => ({
            user: c.user,
            text: c.text,
          })),
        })),
      })),
    },
    null,
    2,
  );
  const truncated =
    jsonPreview.split('\n').slice(0, 18).join('\n') + '\n  ...';

  return (
    <div className="space-y-4 p-5">
      {/* Query with record-count annotations */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 font-mono text-[13px] leading-relaxed">
        <div className="mb-2 font-sans text-[11px] font-medium text-gray-400">
          InstaQL
        </div>
        <div className="text-gray-800">
          <div>
            <span className="text-purple-600">const</span> query ={' '}
            {'{'}
          </div>
          <div className="pl-5">
            lists: {'{'}{' '}
            <span className="text-gray-400 text-[11px]">
              &larr; {lists.length} records
            </span>
          </div>
          <div className="pl-10">
            items: {'{'}{' '}
            <span className="text-gray-400 text-[11px]">
              &larr; {totalItems} records
            </span>
          </div>
          <div className="pl-[60px]">
            comments: {'{}'}{' '}
            <span className="text-gray-400 text-[11px]">
              &larr; {totalComments} records
            </span>
          </div>
          <div className="pl-10">{'}'}</div>
          <div className="pl-5">{'}'}</div>
          <div>{'}'}</div>
        </div>
      </div>

      {/* Truncated JSON result */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <div className="mb-2 font-sans text-[11px] font-medium text-gray-400">
          Result
        </div>
        <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-gray-500">
          {truncated}
        </pre>
      </div>
    </div>
  );
}

// -- Main variant component --------------------------------------------------

export function SyncRelationsV3() {
  const [lists, setLists] = useState<List[]>(demoLists);
  const [activeListId, setActiveListId] = useState(1);
  const [activeItemId, setActiveItemId] = useState<number | null>(1);
  const [tab, setTab] = useState<'app' | 'query'>('app');

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
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm **:text-[16px]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <button
          onClick={() => setTab('app')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            tab === 'app'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          App
        </button>
        <button
          onClick={() => setTab('query')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            tab === 'query'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Query
        </button>
        <div className="flex-1" />
        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Live
        </span>
      </div>

      {/* Content with crossfade */}
      <AnimatePresence mode="wait">
        {tab === 'app' ? (
          <motion.div
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <AppDemoBody
              lists={lists}
              activeListId={activeListId}
              activeItemId={activeItemId}
              onSelectList={handleSelectList}
              onSelectItem={setActiveItemId}
              onToggleItem={handleToggleItem}
            />
          </motion.div>
        ) : (
          <motion.div
            key="query"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <QueryView lists={lists} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
