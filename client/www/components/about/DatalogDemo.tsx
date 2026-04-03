import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';
import { TripleStoreTable } from './TripleStoreTable';

const TRIPLES: [string, string, string | boolean][] = [
  ['todo_1', 'title', 'Ship delight'],
  ['todo_1', 'done', true],
  ['todo_2', 'title', 'Fix bug'],
  ['todo_2', 'done', false],
];

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <div className="h-5 w-[2px] bg-gray-300" />
    </div>
  );
}

export function DatalogDemo({
  filterValue,
  onToggleFilter,
}: {
  filterValue: boolean;
  onToggleFilter: () => void;
}) {
  const matchedEntities = TRIPLES.filter(
    ([, attr, val]) => attr === 'done' && val === filterValue,
  ).map(([ent]) => ent);

  const highlightedKeys = new Set(
    TRIPLES.filter(([ent]) => matchedEntities.includes(ent)).map(
      ([e, a]) => `${e}-${a}`,
    ),
  );

  return (
    <div className="flex flex-col items-center">
      {/* InstaQL */}
      <div className="mb-1 self-start text-[10px] font-medium tracking-wider text-gray-400 uppercase">
        InstaQL
      </div>
      <div
        className="rounded-lg px-3 py-2 font-mono text-xs whitespace-nowrap"
        style={{ backgroundColor: c.bg, color: c.text }}
      >
        <span style={{ color: c.punctuation }}>{'{ '}</span>
        todos
        <span style={{ color: c.punctuation }}>{': { $: { where: { '}</span>
        done
        <span style={{ color: c.punctuation }}>{': '}</span>
        <button
          onClick={onToggleFilter}
          className="inline-block w-[3.2em] cursor-pointer rounded py-0.5 text-center font-semibold transition-colors"
          style={{ backgroundColor: 'rgba(234,157,52,0.15)', color: c.value }}
        >
          {String(filterValue)}
        </button>
        <span style={{ color: c.punctuation }}>{' } } } }'}</span>
      </div>

      <Connector />

      {/* Datalog */}
      <div className="mb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
        Datalog
      </div>
      <div
        className="w-full max-w-[12rem] space-y-1 rounded-lg px-3 py-2 font-mono text-xs"
        style={{ backgroundColor: c.bg }}
      >
        <div className="flex justify-between">
          <span style={{ color: c.punctuation }}>[</span>
          <span style={{ color: c.keyword }}>?todo</span>
          <span style={{ color: c.text }}>"done"</span>
          <button
            onClick={onToggleFilter}
            className="w-[5ch] cursor-pointer text-center font-semibold"
            style={{ color: c.text }}
          >
            {String(filterValue)}
          </button>
          <span style={{ color: c.punctuation }}>]</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: c.punctuation }}>[</span>
          <span style={{ color: c.keyword }}>?todo</span>
          <span style={{ color: c.keyword }}>?attr</span>
          <span style={{ color: c.keyword }}>?val</span>
          <span style={{ color: c.punctuation }}>]</span>
        </div>
      </div>

      <Connector />

      {/* Triple Store */}
      <TripleStoreTable triples={TRIPLES} highlightedKeys={highlightedKeys} />
    </div>
  );
}
