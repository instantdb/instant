import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const USERS = [
  { id: 'daniel_1', name: 'Daniel', img: '/img/landing/daniel.png' },
  { id: 'joe_1', name: 'Joe', img: '/img/landing/joe.jpg' },
];

export function TripleDemo() {
  const [userIdx, setUserIdx] = useState(0);
  const [done, setDone] = useState(true);
  const [title, setTitle] = useState('Ship delight');
  const [showDropdown, setShowDropdown] = useState(false);
  const [lastChangedKey, setLastChangedKey] = useState<string | null>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const taskCardRef = useRef<HTMLDivElement>(null);
  const tripleStoreRef = useRef<HTMLDivElement>(null);
  const [connectorLine, setConnectorLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  const user = USERS[userIdx];

  useEffect(() => {
    const updateConnector = () => {
      const container = containerRef.current;
      const taskCard = taskCardRef.current;
      const tripleStore = tripleStoreRef.current;

      if (!container || !taskCard || !tripleStore) return;

      const containerRect = container.getBoundingClientRect();
      const taskCardRect = taskCard.getBoundingClientRect();
      const tripleStoreRect = tripleStore.getBoundingClientRect();

      const isStacked = taskCardRect.bottom < tripleStoreRect.top - 4;

      const nextLine = isStacked
        ? {
            x1: taskCardRect.left - containerRect.left + taskCardRect.width / 2,
            y1: taskCardRect.bottom - containerRect.top,
            x2:
              tripleStoreRect.left -
              containerRect.left +
              tripleStoreRect.width / 2,
            y2: tripleStoreRect.top - containerRect.top,
          }
        : {
            x1: taskCardRect.right - containerRect.left,
            y1: taskCardRect.top - containerRect.top + taskCardRect.height / 2,
            x2: tripleStoreRect.left - containerRect.left,
            y2:
              tripleStoreRect.top -
              containerRect.top +
              tripleStoreRect.height / 2,
          };

      setConnectorLine((prev) =>
        prev &&
        prev.x1 === nextLine.x1 &&
        prev.y1 === nextLine.y1 &&
        prev.x2 === nextLine.x2 &&
        prev.y2 === nextLine.y2
          ? prev
          : nextLine,
      );
    };

    updateConnector();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateConnector)
        : null;

    if (resizeObserver) {
      [
        containerRef.current,
        taskCardRef.current,
        tripleStoreRef.current,
      ].forEach((node) => {
        if (node) resizeObserver.observe(node);
      });
    }

    window.addEventListener('resize', updateConnector);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateConnector);
    };
  }, []);

  const flash = (key: string) => {
    setLastChangedKey(key);
    setTimeout(() => setLastChangedKey(null), 800);
  };

  const toggleDone = () => {
    setDone((d) => !d);
    flash('task_1-done');
  };

  const selectUser = (idx: number) => {
    setUserIdx(idx);
    setShowDropdown(false);
    flash('task_1-owner');
  };

  const triples: [string, string, string | boolean][] = [
    ['task_1', 'title', title],
    ['task_1', 'done', done],
    ['task_1', 'owner', user.id],
    ['daniel_1', 'avatar', 'daniel.png'],
    ['joe_1', 'avatar', 'joe.jpg'],
  ];

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-stretch gap-6 lg:flex-row lg:items-start lg:gap-12"
    >
      {connectorLine ? (
        <svg
          aria-hidden="true"
          width="100%"
          height="100%"
          className="pointer-events-none absolute inset-0 z-0"
        >
          <line
            x1={connectorLine.x1}
            y1={connectorLine.y1}
            x2={connectorLine.x2}
            y2={connectorLine.y2}
            stroke="#d1d5db"
            strokeWidth="2"
          />
        </svg>
      ) : null}

      {/* Left: Task Detail View */}
      <div className="relative z-10 min-w-0 shrink-0 lg:w-[220px]">
        <div
          ref={taskCardRef}
          className="rounded-xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="relative border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-xs font-medium text-gray-400">
            Team Tasks / #42
            <button
              onClick={() => setShowDropdown((s) => !s)}
              className="absolute right-4 -bottom-3.5 rounded-full border-2 border-white shadow-sm transition-opacity hover:opacity-80"
            >
              <img
                src={user.img}
                alt={user.id}
                className="h-7 w-7 rounded-full object-cover"
              />
            </button>
            {showDropdown && (
              <div className="absolute top-full right-4 z-10 mt-1 flex gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
                {USERS.map((u, i) => (
                  <button
                    key={u.id}
                    onClick={() => selectUser(i)}
                    className={`rounded-full p-0.5 transition-colors hover:bg-gray-100 ${
                      i === userIdx
                        ? 'ring-2 ring-orange-500 ring-offset-1'
                        : ''
                    }`}
                  >
                    <img
                      src={u.img}
                      alt={u.id}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-3">
              <button onClick={toggleDone} className="shrink-0">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-colors ${
                    done ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                  }`}
                >
                  {done && (
                    <svg
                      className="h-3.5 w-3.5 text-white"
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
                </div>
              </button>
              <span
                ref={titleRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  setTitle(titleRef.current?.textContent || '');
                  flash('task_1-title');
                }}
                className={`text-[15px] font-medium outline-none ${
                  done ? 'text-gray-400 line-through' : 'text-gray-800'
                }`}
              >
                Ship delight
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Triple Store Table */}
      <div className="relative z-10 min-w-0 shrink-0 lg:mt-10">
        <div
          ref={tripleStoreRef}
          className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-xs font-medium tracking-wider text-gray-400 uppercase">
            Triple Store
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="px-4 py-2 font-medium">entity</th>
                <th className="px-4 py-2 font-medium">attribute</th>
                <th className="px-4 py-2 font-medium">value</th>
              </tr>
            </thead>
            <tbody>
              {triples.map(([e, a, v]) => {
                const key = `${e}-${a}`;
                const isChanged = key === lastChangedKey;
                return (
                  <motion.tr
                    key={key}
                    initial={false}
                    animate={
                      isChanged
                        ? {
                            backgroundColor: [
                              'rgba(249, 115, 22, 0)',
                              'rgba(249, 115, 22, 0.1)',
                              'rgba(249, 115, 22, 0)',
                            ],
                          }
                        : { backgroundColor: 'rgba(249, 115, 22, 0)' }
                    }
                    transition={{ duration: 0.6 }}
                    className="border-b border-gray-50"
                  >
                    <td className="px-4 py-1.5 font-mono text-xs text-gray-500">
                      {e}
                    </td>
                    <td className="px-4 py-1.5 font-mono text-xs text-gray-500">
                      {a}
                    </td>
                    <td className="px-4 py-1.5 font-mono text-xs text-gray-700">
                      {(() => {
                        const s = String(v);
                        return s.length > 12 ? s.slice(0, 9) + '...' : s;
                      })()}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
