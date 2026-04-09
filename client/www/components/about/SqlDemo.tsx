import { useRef } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';
import { ConnectorLine } from './ConnectorLine';

function Tip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dashed border-gray-400/50">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-[200px] text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function SqlDemo({
  filterValue,
  onToggleFilter,
}: {
  filterValue: boolean;
  onToggleFilter: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instaqlRef = useRef<HTMLDivElement>(null);
  const sqlCardRef = useRef<HTMLDivElement>(null);

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        className="relative flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-10"
      >
        <ConnectorLine
          containerRef={containerRef}
          fromRef={instaqlRef}
          toRef={sqlCardRef}
        />

        {/* Left: InstaQL */}
        <div className="relative z-10 shrink-0">
          <div className="mb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
            InstaQL
          </div>
          <div ref={instaqlRef}>
            <pre
              className="rounded-lg px-3 py-2 font-mono text-xs leading-[1.7]"
              style={{ backgroundColor: c.bg, color: c.text }}
            >
              <span style={{ color: c.punctuation }}>{'{\n'}</span>
              {'  todos'}
              <span style={{ color: c.punctuation }}>{': {\n'}</span>
              {'    $'}
              <span style={{ color: c.punctuation }}>{': {\n'}</span>
              {'      where'}
              <span style={{ color: c.punctuation }}>{': {\n'}</span>
              {'        done'}
              <span style={{ color: c.punctuation }}>{': '}</span>
              <button
                onClick={onToggleFilter}
                className="inline-block w-[3.2em] cursor-pointer rounded py-0.5 text-center font-semibold transition-colors"
                style={{
                  backgroundColor: 'rgba(234,157,52,0.15)',
                  color: c.value,
                }}
              >
                {String(filterValue)}
              </button>
              <span style={{ color: c.punctuation }}>
                {'\n      }\n    }\n  }\n}'}
              </span>
            </pre>
          </div>
        </div>

        {/* Right: Postgres card */}
        <div className="relative z-10 min-w-0 flex-1">
          <div
            ref={sqlCardRef}
            className="rounded-xl border border-gray-200 shadow-sm"
            style={{ backgroundColor: c.bg }}
          >
            <div className="flex items-center gap-2 border-b border-gray-200/60 px-4 py-2">
              <img
                src="/img/about/postgres.svg"
                alt="Postgres"
                className="h-5 w-5"
              />
              <span className="text-xs font-medium" style={{ color: c.text }}>
                Postgres
              </span>
            </div>
            <pre
              className="overflow-visible px-4 py-3 font-mono text-[11px] leading-[1.7]"
              style={{ color: c.text }}
            >
              <span style={{ color: c.keyword }}>WITH </span>
              <Tip label="First, find all todo triples where done is true">
                done_triples
              </Tip>
              <span style={{ color: c.keyword }}>{' AS ('}</span>
              {'\n  '}
              <span style={{ color: c.keyword }}>SELECT </span>
              {'entity_id'}
              {'\n  '}
              <span style={{ color: c.keyword }}>FROM </span>
              {'triples'}
              {'\n  '}
              <span style={{ color: c.keyword }}>WHERE </span>
              <Tip label="All triples are partitioned by app_id, so data across tenants is isolated">
                {'app_id'}
              </Tip>
              {' = '}
              <span style={{ color: c.string }}>&apos;instalinear&apos;</span>
              {'\n    '}
              <span style={{ color: c.keyword }}>AND </span>
              <Tip label="A partial index on (attr, value, entity) that makes queries like this fast">
                {'ave'}
              </Tip>
              {'\n    '}
              <span style={{ color: c.keyword }}>AND </span>
              {'attr_id = '}
              <span style={{ color: c.string }}>&apos;todo-done&apos;</span>
              {'\n    '}
              <span style={{ color: c.keyword }}>AND </span>
              {'value = '}
              <button
                onClick={onToggleFilter}
                className="cursor-pointer font-semibold text-orange-600 hover:text-orange-700"
              >
                {String(filterValue)}
              </button>
              {'\n'}
              <span style={{ color: c.keyword }}>{')'}</span>
              {',\n'}
              <Tip label="Now fetch all attributes for the done triples we found">
                todo_data
              </Tip>
              <span style={{ color: c.keyword }}>{' AS ('}</span>
              {'\n  '}
              <span style={{ color: c.keyword }}>SELECT </span>
              {'t.entity_id, t.attr_id, t.value'}
              {'\n  '}
              <span style={{ color: c.keyword }}>FROM </span>
              {'triples t'}
              {'\n  '}
              <span style={{ color: c.keyword }}>JOIN </span>
              {'done_triples d'}
              {'\n    '}
              <span style={{ color: c.keyword }}>ON </span>
              {'t.entity_id = d.entity_id'}
              {'\n  '}
              <span style={{ color: c.keyword }}>WHERE </span>
              {'t.app_id = '}
              <span style={{ color: c.string }}>&apos;instalinear&apos;</span>
              {'\n'}
              <span style={{ color: c.keyword }}>{')'}</span>
              {'\n'}
              <span style={{ color: c.keyword }}>SELECT </span>
              {'* '}
              <span style={{ color: c.keyword }}>FROM </span>
              {'todo_data'}
            </pre>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
