import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/select';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

interface WALTriple {
  table: string;
  action: 'insert' | 'update' | 'delete';
  e: string;
  a?: string;
  v?: string;
}

interface WALEvent {
  id: number;
  txId: number;
  description: string;
  triples: WALTriple[];
}

const NEW_TODO_TITLES = [
  'Deploy to prod',
  'Review PR',
  'Update deps',
  'Add tests',
  'Clean up logs',
];

const INITIAL_TODOS: Todo[] = [
  { id: 'todo_1', title: 'Ship delight', done: true },
  { id: 'todo_2', title: 'Fix bug', done: false },
];

interface Query {
  id: string;
  label: string;
  instaql: React.ReactNode;
  indexTopic: string;
  // Pattern for matching WAL triples against this query's index topic
  indexMatch: { attr: string; value?: string };
  filter: (t: Todo) => boolean;
}

const QUERIES: Query[] = [
  {
    id: 'q1',
    label: 'All todos',
    instaql: (
      <code className="font-mono text-[11px]" style={{ color: c.punctuation }}>
        {'{ '}
        <span style={{ color: c.text }}>todos</span>
        {': {} }'}
      </code>
    ),
    indexTopic: '[_ "todos/id" _]',
    indexMatch: { attr: 'todos/id' },
    filter: (_t: Todo) => true,
  },
  {
    id: 'q2',
    label: 'Completed todos',
    instaql: (
      <pre
        className="font-mono text-[11px] leading-[1.6]"
        style={{ color: c.punctuation }}
      >
        {`{
  `}
        <span style={{ color: c.text }}>todos</span>
        {`: {
    $: { where: { `}
        <span style={{ color: c.parameter }}>done</span>
        {`: `}
        <span style={{ color: c.value }}>true</span>
        {` } }
  }
}`}
      </pre>
    ),
    indexTopic: '[_ "todos/done" true]',
    indexMatch: { attr: 'todos/done', value: 'true' },
    filter: (t: Todo) => t.done,
  },
];

export function WALInvalidationDemo() {
  const [todos, setTodos] = useState<Todo[]>(INITIAL_TODOS);
  const [walEvents, setWalEvents] = useState<WALEvent[]>([]);
  const [invalidated, setInvalidated] = useState<Set<string>>(new Set());
  const [activeQuery, setActiveQuery] = useState(0);
  const walCounter = useRef(0);
  const txCounter = useRef(0);
  const newTodoIdx = useRef(0);
  const todoCounter = useRef(INITIAL_TODOS.length);
  const walScrollRef = useRef<HTMLDivElement>(null);

  const addWalEvent = (description: string, triples: WALTriple[]) => {
    const id = walCounter.current++;
    const txId = ++txCounter.current;
    setWalEvents((prev) => [...prev, { id, txId, description, triples }]);
    requestAnimationFrame(() => {
      const el = walScrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  };

  const [invalidatedTopics, setInvalidatedTopics] = useState<Set<string>>(
    new Set(),
  );

  /** Check WAL triples against all query topics to determine what's invalidated */
  const computeInvalidation = (triples: WALTriple[]) => {
    const affectedQueries = new Set<string>();
    const affectedTopics = new Set<string>();

    for (const query of QUERIES) {
      // Get current result IDs for this query's entity topic
      const resultIds = new Set(todos.filter(query.filter).map((t) => t.id));

      for (const triple of triples) {
        // Check index topic: does the triple's attr (and optionally value) match?
        const attrMatch = triple.a === query.indexMatch.attr;
        const valueMatch =
          !query.indexMatch.value || triple.v === query.indexMatch.value;
        if (attrMatch && valueMatch) {
          affectedQueries.add(query.id);
          affectedTopics.add(`${query.id}-index`);
        }

        // Check entity topic: is the triple's entity in this query's result set?
        if (resultIds.has(triple.e)) {
          affectedQueries.add(query.id);
          affectedTopics.add(`${query.id}-entity`);
        }
      }
    }

    setInvalidated(affectedQueries);
    setInvalidatedTopics(affectedTopics);
    setTimeout(() => {
      setInvalidated(new Set());
      setInvalidatedTopics(new Set());
    }, 400);
  };

  const toggleTodo = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );

    const triples: WALTriple[] = [
      {
        table: 'triples',
        action: 'update',
        e: id,
        a: 'todos/done',
        v: String(!todo.done),
      },
    ];
    addWalEvent(
      `${todo.title} marked ${!todo.done ? 'done' : 'not done'}`,
      triples,
    );
    computeInvalidation(triples);
  };

  const addTodo = () => {
    const title = NEW_TODO_TITLES[newTodoIdx.current % NEW_TODO_TITLES.length];
    const id = `todo_${++todoCounter.current}`;
    newTodoIdx.current++;

    setTodos((prev) => [{ id, title, done: false }, ...prev]);

    const triples: WALTriple[] = [
      { table: 'triples', action: 'insert', e: id, a: 'todos/id', v: id },
      { table: 'triples', action: 'insert', e: id, a: 'todos/title', v: title },
      {
        table: 'triples',
        action: 'insert',
        e: id,
        a: 'todos/done',
        v: 'false',
      },
    ];
    addWalEvent(`${title} created`, triples);
    computeInvalidation(triples);
  };

  const deleteTodo = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    setTodos((prev) => prev.filter((t) => t.id !== id));

    const triples: WALTriple[] = [
      { table: 'triples', action: 'delete', e: id, a: 'todos/id', v: id },
      {
        table: 'triples',
        action: 'delete',
        e: id,
        a: 'todos/title',
        v: todo?.title,
      },
      {
        table: 'triples',
        action: 'delete',
        e: id,
        a: 'todos/done',
        v: String(todo?.done),
      },
    ];
    addWalEvent(`${todo?.title ?? id} deleted`, triples);
    computeInvalidation(triples);
  };

  const query = QUERIES[activeQuery];
  const queryResults = todos.filter(query.filter);

  return (
    <div className="flex flex-col gap-3 sm:h-[508px] sm:flex-row sm:gap-4">
      {/* Left column: contents on mobile so order works, flex-col on desktop */}
      <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col sm:gap-3">
        {/* Mini todo app */}
        <div className="order-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:order-none">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-4 py-2">
            <span className="text-xs font-medium text-gray-400">My Todos</span>
            <button
              onClick={addTodo}
              className="flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500 transition-colors hover:border-orange-300 hover:text-orange-600"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Add
            </button>
          </div>
          <div className="h-[100px] overflow-y-auto sm:h-[150px]">
            <AnimatePresence initial={false}>
              {todos.map((todo) => (
                <motion.div
                  key={todo.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 border-b border-gray-50 px-4 py-2.5"
                >
                  <button
                    onClick={() => toggleTodo(todo.id)}
                    className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border-2 transition-colors ${
                      todo.done
                        ? 'border-orange-500 bg-orange-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {todo.done && (
                      <svg
                        className="h-3 w-3 text-white"
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
                    className={`flex-1 text-sm ${
                      todo.done ? 'text-gray-400 line-through' : 'text-gray-700'
                    }`}
                  >
                    {todo.title}
                  </span>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="shrink-0 cursor-pointer text-gray-300 transition-colors hover:text-gray-500"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Query switcher — fixed height */}
        <motion.div
          className="order-3 flex h-[220px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:order-none sm:h-[310px]"
          animate={{
            borderColor: invalidated.has(query.id) ? '#f97316' : '#e5e7eb',
          }}
          transition={{ duration: 0.3 }}
        >
          {/* Query selector */}
          <div className="border-b border-gray-100 bg-gray-50/60 px-3 py-2">
            <Select
              value={String(activeQuery)}
              onValueChange={(v) => setActiveQuery(Number(v))}
            >
              <SelectTrigger size="sm" className="text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUERIES.map((q, i) => (
                  <SelectItem key={q.id} value={String(i)}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scrollable content below selector */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-3 py-2">
              <div className="font-mono text-[11px]">{query.instaql}</div>
            </div>

            <div className="border-t border-gray-50 px-3 py-2">
              <div className="text-[9px] font-medium tracking-wider text-gray-300 uppercase">
                Topics
              </div>
              <div className="mt-0.5 space-y-0.5 font-mono text-[10px]">
                <div
                  className={`rounded px-1 py-0.5 transition-colors duration-300 ${
                    invalidatedTopics.has(`${query.id}-index`)
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-400'
                  }`}
                >
                  {query.indexTopic}
                </div>
                <div
                  className={`rounded px-1 py-0.5 transition-colors duration-300 ${
                    invalidatedTopics.has(`${query.id}-entity`)
                      ? 'bg-orange-100 text-orange-600'
                      : 'text-gray-400'
                  }`}
                >
                  <EntityTopic ids={queryResults.map((r) => r.id)} />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-50 px-3 py-2">
              <div className="relative flex items-center">
                <div className="text-[9px] font-medium tracking-wider text-gray-300 uppercase">
                  Results
                </div>
                <AnimatePresence>
                  {invalidated.has(query.id) && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute left-[46px] rounded-full bg-orange-100 px-1.5 py-0.5 text-[8px] font-medium text-orange-600"
                    >
                      refreshing
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-1 space-y-0.5">
                {queryResults.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-gray-600"
                  >
                    <div
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border opacity-40 ${
                        r.done
                          ? 'border-gray-400 bg-gray-400'
                          : 'border-gray-300'
                      }`}
                    >
                      {r.done && (
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
                    </div>
                    {r.title}
                  </div>
                ))}
                {queryResults.length === 0 && (
                  <div className="text-[11px] text-gray-300 italic">
                    No results
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right column: WAL stream — full height */}
      <div className="order-2 flex h-[200px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:order-none sm:h-auto sm:w-[250px] sm:shrink-0 sm:self-stretch">
        <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
          WAL Stream
        </div>
        <div ref={walScrollRef} className="flex-1 overflow-y-auto px-3 py-1.5">
          <div>
            {walEvents.map((evt, idx) => (
              <div key={evt.id} className="py-1">
                {/* Separator with tx-id centered */}
                <div
                  className={`flex items-center gap-2 ${idx > 0 ? 'mt-1' : ''}`}
                >
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="shrink-0 font-mono text-[9px] text-gray-400">
                    tx-{evt.txId}
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {evt.description}
                </div>
                {evt.triples.map((t, i) => (
                  <div
                    key={i}
                    className="mt-0.5 rounded bg-gray-50 px-1.5 py-1 font-mono text-[10px] leading-[1.6] text-gray-600"
                  >
                    <div>
                      <span className="text-gray-500">table:</span> {t.table}
                    </div>
                    <div>
                      <span className="text-gray-500">action:</span> {t.action}
                    </div>
                    <div>
                      <span className="text-gray-500">entity_id:</span> {t.e}
                    </div>
                    {t.a && (
                      <div>
                        <span className="text-gray-500">attr_id:</span> {t.a}
                      </div>
                    )}
                    {t.v != null && (
                      <div>
                        <span className="text-gray-500">value:</span> {t.v}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {walEvents.length === 0 && (
            <div className="flex h-full items-center justify-center text-[10px] text-gray-300">
              Toggle or add a todo to see events
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityTopic({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false);
  const maxVisible = 1;
  const needsCollapse = ids.length > maxVisible;

  if (!needsCollapse) {
    return <div>[{`{${ids.join(', ')}}`}, _, _]</div>;
  }

  const visible = ids.slice(0, maxVisible);
  const remaining = ids.length - maxVisible;

  return (
    <div>
      [{`{${visible.join(', ')}, `}
      <span className="relative inline-block">
        <button
          onClick={() => setOpen((o) => !o)}
          className="cursor-pointer text-orange-500 hover:text-orange-600"
        >
          +{remaining} more
        </button>
        {open && (
          <div className="absolute bottom-full left-0 z-50 mb-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 shadow-md">
            {ids.map((id) => (
              <div
                key={id}
                className="text-[10px] whitespace-nowrap text-gray-500"
              >
                {id}
              </div>
            ))}
          </div>
        )}
      </span>
      {'}'}, _, _]
    </div>
  );
}
