import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// -- Data -------------------------------------------------------------------

type Row = Record<string, string | number | boolean>;

const data: Record<string, Row[]> = {
  $users: [
    { id: '1', email: 'mark.s@lumon', name: 'Mark S.' },
    { id: '2', email: 'helly.r@lumon', name: 'Helly R.' },
    { id: '3', email: 'irving.b@lumon', name: 'Irving B.' },
    { id: '4', email: 'dylan.g@lumon', name: 'Dylan G.' },
  ],
  projects: [
    { id: '1', title: 'Cold Harbor', status: 'active', refiner: 'Mark S.' },
    { id: '2', title: 'Dranesville', status: 'complete', refiner: 'Mark S.' },
    { id: '3', title: 'Siena', status: 'active', refiner: 'Helly R.' },
    { id: '4', title: 'Cairns', status: 'active', refiner: 'Irving B.' },
    { id: '5', title: 'Tumwater', status: 'active', refiner: 'Dylan G.' },
  ],
  tasks: [
    { id: '1', body: 'Sort bin WO-4983', project: 'Cold Harbor', owner: 'Mark S.', done: true },
    { id: '2', body: 'Refine sector 12B', project: 'Dranesville', owner: 'Mark S.', done: true },
    { id: '3', body: 'Flag scary numbers', project: 'Siena', owner: 'Helly R.', done: false },
    { id: '4', body: 'Audit file metadata', project: 'Cairns', owner: 'Irving B.', done: false },
    { id: '5', body: 'Complete quota', project: 'Tumwater', owner: 'Dylan G.', done: false },
  ],
};

// Schema: which fields to show + which link columns to offer
type LinkCol = string | { ns: string; label: string };

type SchemaEntry = {
  fields: string[];
  links: LinkCol[];
  linkedFields?: { field: string; targetNs: string }[];
};

function getLinkNs(lc: LinkCol): string {
  return typeof lc === 'string' ? lc : lc.ns;
}

function getLinkLabel(lc: LinkCol): string {
  return typeof lc === 'string' ? lc : lc.label;
}

const schema: Record<string, SchemaEntry> = {
  $users: { fields: ['email'], links: ['projects', 'tasks'] },
  projects: {
    fields: ['title', 'status'],
    links: ['tasks'],
    linkedFields: [{ field: 'refiner', targetNs: '$users' }],
  },
  tasks: {
    fields: ['body', 'done'],
    links: [],
    linkedFields: [
      { field: 'project', targetNs: 'projects' },
      { field: 'owner', targetNs: '$users' },
    ],
  },
};

// Bidirectional link graph: links[fromNs][toNs][fromId] = [toId, ...]
const links: Record<string, Record<string, Record<string, string[]>>> = {
  $users: {
    projects: { '1': ['1', '2'], '2': ['3'], '3': ['4'], '4': ['5'] },
    tasks: { '1': ['1', '2'], '2': ['3'], '3': ['4'], '4': ['5'] },
  },
  projects: {
    $users: { '1': ['1'], '2': ['1'], '3': ['2'], '4': ['3'], '5': ['4'] },
    tasks: { '1': ['1'], '2': ['2'], '3': ['3'], '4': ['4'], '5': ['5'] },
  },
  tasks: {
    projects: { '1': ['1'], '2': ['2'], '3': ['3'], '4': ['4'], '5': ['5'] },
    $users: { '1': ['1'], '2': ['1'], '3': ['2'], '4': ['3'], '5': ['4'] },
  },
};

// -- Helpers ----------------------------------------------------------------

function getLinkedIds(fromNs: string, toNs: string, fromId: string): string[] {
  return links[fromNs]?.[toNs]?.[fromId] ?? [];
}

function renderCell(value: string | number | boolean) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="text-green-600">✓</span>
    ) : (
      <span className="text-gray-300">—</span>
    );
  }
  return String(value);
}

// -- Types ------------------------------------------------------------------

type Filter = {
  fromNs: string;
  fromId: string;
  fromLabel: string;
  toNs: string;
  ids: string[];
};

// -- Component --------------------------------------------------------------

const namespaces = Object.keys(schema);

export function UsersExplorerDemo() {
  const [selectedNs, setSelectedNs] = useState('$users');
  const [filter, setFilter] = useState<Filter | null>(null);

  const activeNs = filter ? filter.toNs : selectedNs;
  const { fields, links: linkCols, linkedFields = [] } = schema[activeNs];

  // Determine which rows to show
  const allRows = data[activeNs];
  const visibleRows = filter
    ? allRows.filter((r) => filter.ids.includes(String(r.id)))
    : allRows;

  function handleSelectNs(ns: string) {
    setSelectedNs(ns);
    setFilter(null);
  }

  function handleLinkClick(fromNs: string, fromRow: Row, toNs: string) {
    const fromId = String(fromRow.id);
    const ids = getLinkedIds(fromNs, toNs, fromId);
    if (ids.length === 0) return;
    const label =
      String(
        fromRow.name || fromRow.title || fromRow.body || fromId
      ).slice(0, 20);
    setFilter({ fromNs, fromId, fromLabel: label, toNs, ids });
  }

  function handleClearFilter() {
    if (filter) {
      setSelectedNs(filter.fromNs);
      setFilter(null);
    }
  }

  return (
    <div className="h-[230px] overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-[110px] shrink-0 border-r border-gray-100 bg-gray-50/70 p-2">
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <svg
              className="h-3.5 w-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
              />
            </svg>
            <span className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
              Explorer
            </span>
          </div>
          <div className="space-y-0.5">
            {namespaces.map((ns) => {
              const isActive = activeNs === ns;
              return (
                <button
                  key={ns}
                  onClick={() => handleSelectNs(ns)}
                  className={`relative w-full rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-colors ${
                    isActive
                      ? 'font-medium text-orange-600'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="ns-highlight"
                      className="absolute inset-0 rounded-md bg-orange-50 ring-1 ring-orange-200"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">{ns}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Filter breadcrumb */}
          <AnimatePresence>
            {filter && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="shrink-0 overflow-hidden"
              >
                <div className="flex items-center gap-1.5 border-b border-gray-100 bg-orange-50/50 px-3 py-1.5">
                  <button
                    onClick={handleClearFilter}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-orange-600 hover:bg-orange-100"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    {filter.fromNs}
                  </button>
                  <span className="text-[10px] text-gray-300">/</span>
                  <span className="font-mono text-xs text-gray-500">
                    {filter.fromLabel}
                  </span>
                  <span className="text-[10px] text-gray-300">→</span>
                  <span className="font-mono text-xs font-medium text-orange-600">
                    {filter.toNs}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table */}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {fields.map((f) => (
                    <th
                      key={f}
                      className="px-3 py-2 font-mono text-[10px] font-medium tracking-wide text-gray-400 uppercase"
                    >
                      {f}
                    </th>
                  ))}
                  {linkedFields.map((lf) => (
                    <th
                      key={lf.field}
                      className="px-3 py-2 font-mono text-[10px] font-medium tracking-wide text-gray-400 uppercase"
                    >
                      {lf.field}
                    </th>
                  ))}
                  {linkCols.map((lc) => (
                    <th
                      key={getLinkNs(lc)}
                      className="px-3 py-2 font-mono text-[10px] font-medium tracking-wide text-gray-400 uppercase"
                    >
                      {getLinkLabel(lc)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {visibleRows.map((row) => (
                    <motion.tr
                      key={`${activeNs}-${row.id}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="border-b border-gray-50 last:border-b-0"
                    >
                      {fields.map((f) => (
                        <td
                          key={f}
                          className="max-w-[140px] truncate px-3 py-2 text-gray-700"
                        >
                          {renderCell(row[f])}
                        </td>
                      ))}
                      {linkedFields.map((lf) => {
                        const ids = getLinkedIds(
                          activeNs,
                          lf.targetNs,
                          String(row.id)
                        );
                        return (
                          <td key={lf.field} className="px-3 py-2">
                            <button
                              onClick={() => {
                                if (ids.length === 0) return;
                                setFilter({
                                  fromNs: activeNs,
                                  fromId: String(row.id),
                                  fromLabel: String(
                                    row.name || row.title || row.body || row.id
                                  ).slice(0, 20),
                                  toNs: lf.targetNs,
                                  ids,
                                });
                              }}
                              className="truncate font-mono text-orange-500 hover:text-orange-600"
                            >
                              {String(row[lf.field])}
                            </button>
                          </td>
                        );
                      })}
                      {linkCols.map((lc) => {
                          const ns = getLinkNs(lc);
                          const linkedIds = getLinkedIds(
                            activeNs,
                            ns,
                            String(row.id)
                          );
                          const count = linkedIds.length;
                          return (
                            <td key={ns} className="px-3 py-2">
                              {count > 0 ? (
                                <button
                                  onClick={() =>
                                    handleLinkClick(activeNs, row, ns)
                                  }
                                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-orange-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
                                >
                                  {count}
                                  <svg
                                    className="h-2.5 w-2.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                </button>
                              ) : (
                                <span className="px-1.5 py-0.5 text-gray-300">
                                  0
                                </span>
                              )}
                            </td>
                          );
                        })}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
