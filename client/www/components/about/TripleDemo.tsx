import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { ConnectorLine } from './ConnectorLine';
import { TripleStoreTable } from './TripleStoreTable';

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

  const user = USERS[userIdx];

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
      <ConnectorLine
        containerRef={containerRef}
        fromRef={taskCardRef}
        toRef={tripleStoreRef}
      />

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
              className="absolute right-4 -bottom-3.5 overflow-hidden rounded-full border-2 border-white shadow-sm transition-opacity hover:opacity-80"
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={user.id}
                  src={user.img}
                  alt={user.id}
                  className="h-7 w-7 rounded-full object-cover"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                />
              </AnimatePresence>
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
      <div
        ref={tripleStoreRef}
        className="relative z-10 min-w-0 shrink-0 lg:mt-10"
      >
        <TripleStoreTable
          triples={triples}
          highlightedKeys={
            lastChangedKey ? new Set([lastChangedKey]) : undefined
          }
          highlightMethod="flash"
          truncateValues
        />
      </div>
    </div>
  );
}
