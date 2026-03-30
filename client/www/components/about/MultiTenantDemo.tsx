/**
 * Multi-tenancy demo.
 *
 * A single triples table with rows from multiple apps. An app selector
 * filters the view, showing how one database serves isolated data.
 */

import { useState } from 'react';
import { motion } from 'motion/react';

type AppId = 'todos' | 'blog' | 'chat';

interface Triple {
  appId: AppId;
  entity: string;
  attr: string;
  value: string;
}

const APPS: { id: AppId; label: string; color: string; bgColor: string }[] = [
  {
    id: 'todos',
    label: 'Todos',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,0.08)',
  },
  {
    id: 'blog',
    label: 'Blog',
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,0.08)',
  },
  {
    id: 'chat',
    label: 'Chat',
    color: '#8b5cf6',
    bgColor: 'rgba(139,92,246,0.08)',
  },
];

const TRIPLES: Triple[] = [
  { appId: 'todos', entity: 'todo_1', attr: 'title', value: 'Ship v2' },
  { appId: 'blog', entity: 'post_1', attr: 'title', value: 'Hello world' },
  { appId: 'chat', entity: 'msg_1', attr: 'text', value: 'Hey team!' },
  { appId: 'todos', entity: 'todo_1', attr: 'done', value: 'false' },
  { appId: 'blog', entity: 'post_1', attr: 'author', value: 'Alice' },
  { appId: 'chat', entity: 'msg_1', attr: 'sender', value: 'Bob' },
  { appId: 'todos', entity: 'todo_2', attr: 'title', value: 'Fix bugs' },
  { appId: 'blog', entity: 'post_2', attr: 'title', value: 'Our roadmap' },
  { appId: 'chat', entity: 'msg_2', attr: 'text', value: 'Ship it!' },
  { appId: 'todos', entity: 'todo_2', attr: 'done', value: 'true' },
  { appId: 'blog', entity: 'post_2', attr: 'author', value: 'Charlie' },
  { appId: 'chat', entity: 'msg_2', attr: 'sender', value: 'Alice' },
];

export function MultiTenantDemo() {
  const [selected, setSelected] = useState<AppId | 'all'>('all');

  const filtered =
    selected === 'all' ? TRIPLES : TRIPLES.filter((t) => t.appId === selected);

  const appColor = (appId: AppId) =>
    APPS.find((a) => a.id === appId)?.color ?? '#6b7280';

  const appBg = (appId: AppId) =>
    APPS.find((a) => a.id === appId)?.bgColor ?? 'transparent';

  return (
    <div className="flex flex-col gap-3">
      {/* App selector */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400">View as:</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setSelected('all')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              selected === 'all'
                ? 'border-gray-700 bg-gray-700 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            All apps
          </button>
          {APPS.map((app) => (
            <button
              key={app.id}
              onClick={() => setSelected(app.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                selected === app.id
                  ? 'border-transparent text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
              style={
                selected === app.id
                  ? { backgroundColor: app.color, borderColor: app.color }
                  : {}
              }
            >
              {app.label}
            </button>
          ))}
        </div>
      </div>

      {/* Triples table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 py-2">
          <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
            Triples
          </span>
          <span className="text-[10px] text-gray-400">
            {selected === 'all'
              ? `${APPS.length} apps, 1 database`
              : `Showing ${filtered.length} of ${TRIPLES.length} rows`}
          </span>
        </div>
        <div className="grid grid-cols-4 border-b border-gray-100 text-[10px] text-gray-400">
          <div className="px-3 py-1.5 font-medium">app_id</div>
          <div className="px-3 py-1.5 font-medium">entity</div>
          <div className="px-3 py-1.5 font-medium">attr</div>
          <div className="px-3 py-1.5 font-medium">value</div>
        </div>
        <div className="h-[200px] overflow-y-auto">
          {TRIPLES.map((triple, i) => {
            const isVisible = selected === 'all' || triple.appId === selected;
            return (
              <motion.div
                key={`${triple.appId}-${triple.entity}-${triple.attr}`}
                className="grid grid-cols-4 border-b border-gray-50"
                animate={{
                  opacity: isVisible ? 1 : 0.15,
                }}
                transition={{ duration: 0.2 }}
                style={{
                  backgroundColor: isVisible
                    ? appBg(triple.appId)
                    : 'transparent',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="px-3 py-1.5 font-mono text-[10px] font-medium"
                  style={{ color: appColor(triple.appId) }}
                >
                  {triple.appId}
                </div>
                <div className="px-3 py-1.5 font-mono text-[10px] text-gray-500">
                  {triple.entity}
                </div>
                <div className="px-3 py-1.5 font-mono text-[10px] text-gray-500">
                  {triple.attr}
                </div>
                <div className="px-3 py-1.5 font-mono text-[10px] text-gray-700">
                  {triple.value}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
