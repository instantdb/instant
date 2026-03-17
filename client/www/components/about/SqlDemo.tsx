import { useRef } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';
import { ConnectorLine } from './ConnectorLine';

function AuroraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient x1="0%" y1="100%" x2="100%" y2="0%" id="aurora-grad">
          <stop stopColor="#2E27AD" offset="0%" />
          <stop stopColor="#527FFF" offset="100%" />
        </linearGradient>
      </defs>
      <rect
        fill="url(#aurora-grad)"
        x="0"
        y="0"
        width="80"
        height="80"
        rx="8"
      />
      <path
        d="M45.09 18.05H42.08V16.03h3.01V13h2.01v3.03h3.01v2.02h-3.01v3.03h-2.01v-3.03ZM57.12 29.14h-3.01v-2.02h3.01v-3.03h2.01v3.03h3.01v2.02h-3.01v3.03h-2.01v-3.03ZM51.9 61.03c-1.92-4.87-6.33-9.31-11.17-11.24 4.84-1.93 9.25-6.37 11.17-11.24 1.92 4.87 6.34 9.31 11.17 11.24-4.83 1.93-9.25 6.37-11.17 11.24ZM68 48.78c-7.05 0-15.09-8.09-15.09-15.19 0-.56-.45-1.01-1-1.01-.56 0-1 .45-1 1.01 0 7.1-8.04 15.19-15.1 15.19-.55 0-1 .45-1 1.01s.45 1.01 1 1.01c7.06 0 15.1 8.09 15.1 15.19 0 .56.44 1.01 1 1.01.55 0 1-.45 1-1.01 0-7.1 8.04-15.19 15.09-15.19.56 0 1-.45 1-1.01s-.44-1.01-1-1.01ZM13 28.9c2.92 2.14 8.6 3.27 14.04 3.27s11.12-1.13 14.04-3.27v9.66c-1.44 1.93-6.76 3.84-13.84 3.84-8.15 0-14.24-2.56-14.24-4.85V28.9ZM27.04 21.07c8.7 0 14.04 2.65 14.04 4.54 0 1.9-5.34 4.54-14.04 4.54s-14.04-2.64-14.04-4.54c0-1.89 5.34-4.54 14.04-4.54ZM41.08 58.94c0 2.33-6 4.93-14.04 4.93s-14.04-2.6-14.04-4.93v-6.45c2.96 2.26 8.74 3.45 14.3 3.45 3.86 0 7.6-.55 10.51-1.55l-.64-1.91c-2.71.93-6.22 1.44-9.87 1.44-8.18 0-14.3-2.56-14.3-4.85v-8.09c2.95 2.25 8.71 3.44 14.24 3.44 5.92 0 11-1.23 13.84-3.17v3.03h2v-18.67C43.09 21.35 34.82 19.05 27.04 19.05c-7.46 0-15.35 2.12-15.98 6.05H11v33.83c0 4.51 8.26 6.95 16.04 6.95 7.78 0 16.05-2.43 16.05-6.95v-3.56h-2.01v3.56Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

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
              <AuroraIcon className="h-5 w-5 rounded" />
              <span className="text-xs font-medium" style={{ color: c.text }}>
                Aurora Postgres
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
