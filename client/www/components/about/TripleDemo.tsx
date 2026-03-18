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
              onClick={() => selectUser((userIdx + 1) % USERS.length)}
              className="absolute right-4 -bottom-3.5 h-10 w-10 transition-opacity hover:opacity-80"
            >
              {USERS.map((u, i) => (
                <img
                  key={u.id}
                  src={u.img}
                  alt={u.name}
                  className={`absolute top-0 left-0 h-7 w-7 rounded-full border-2 border-white object-cover shadow-sm transition-all ${
                    i === userIdx
                      ? 'z-10'
                      : 'z-0 translate-x-2 translate-y-2 scale-90'
                  }`}
                />
              ))}
            </button>
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
