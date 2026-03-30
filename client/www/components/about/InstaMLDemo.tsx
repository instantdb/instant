/**
 * InstaML pipeline visualization.
 *
 * Left: InstaML code with interactive fields.
 * Right: txSteps + Postgres in a single card.
 * ConnectorLine between them. Fields update live.
 */

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ConnectorLine } from './ConnectorLine';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

const flashAnim = (active: boolean) =>
  active
    ? {
        backgroundColor: [
          'rgba(249,115,22,0)',
          'rgba(249,115,22,0.1)',
          'rgba(249,115,22,0)',
        ],
      }
    : {};

export function InstaMLDemo() {
  const [title, setTitle] = useState('Ship the feature');
  const [done, setDone] = useState(false);
  const [lastChanged, setLastChanged] = useState<string | null>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const instamlRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const flash = (key: string) => {
    setLastChanged(key);
    setTimeout(() => setLastChanged(null), 1000);
  };

  const entityId = 'eid-a1b';

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-10"
    >
      <ConnectorLine
        containerRef={containerRef}
        fromRef={instamlRef}
        toRef={outputRef}
      />

      {/* Left: InstaML */}
      <div className="relative z-10 shrink-0">
        <div className="mb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
          InstaML
        </div>
        <div ref={instamlRef}>
          <pre
            className="rounded-lg px-4 py-3 font-mono text-xs leading-[1.8]"
            style={{ backgroundColor: c.bg, color: c.text }}
          >
            <span style={{ color: c.punctuation }}>db.</span>
            <span style={{ color: c.keyword }}>transact</span>
            <span style={{ color: c.punctuation }}>(</span>
            {'\n  '}
            <span style={{ color: c.punctuation }}>db.tx.</span>
            <span style={{ color: c.tag }}>todos</span>
            <span style={{ color: c.punctuation }}>[</span>
            <span style={{ color: c.value }}>id()</span>
            <span style={{ color: c.punctuation }}>].</span>
            <span style={{ color: c.keyword }}>update</span>
            <span style={{ color: c.punctuation }}>({'{'}</span>
            {'\n'}
            <motion.span
              className="inline-block w-full rounded"
              animate={flashAnim(lastChanged === 'title')}
              transition={{ duration: 1 }}
            >
              {'    '}
              <span style={{ color: c.parameter }}>title</span>
              <span style={{ color: c.punctuation }}>: </span>
              <span style={{ color: c.string }}>&quot;</span>
              <span
                ref={titleRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  setTitle(titleRef.current?.textContent || '');
                  flash('title');
                }}
                className="outline-none"
                style={{ color: c.string }}
              >
                {title}
              </span>
              <span style={{ color: c.string }}>&quot;</span>
              <span style={{ color: c.punctuation }}>,</span>
            </motion.span>
            {'\n'}
            <motion.span
              className="inline-block w-full cursor-pointer rounded"
              animate={flashAnim(lastChanged === 'done')}
              transition={{ duration: 1 }}
              onClick={() => {
                setDone((d) => !d);
                flash('done');
              }}
            >
              {'    '}
              <span style={{ color: c.parameter }}>done</span>
              <span style={{ color: c.punctuation }}>: </span>
              <span
                className="rounded px-0.5 font-semibold"
                style={{
                  backgroundColor: 'rgba(234,157,52,0.15)',
                  color: c.value,
                }}
              >
                {String(done)}
              </span>
            </motion.span>
            {'\n  '}
            <span style={{ color: c.punctuation }}>{'}))'}</span>
          </pre>
        </div>
      </div>

      {/* Right: Output card (txSteps + Postgres) */}
      <div className="relative z-10 min-w-0 flex-1">
        <div
          ref={outputRef}
          className="overflow-hidden rounded-xl border border-gray-200 shadow-sm"
          style={{ backgroundColor: c.bg }}
        >
          {/* txSteps section */}
          <div className="border-b border-gray-200/60 px-4 py-2">
            <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
              txSteps
            </span>
          </div>
          <div className="border-b border-gray-200/40 px-4 py-2.5 font-mono text-[11px] leading-[1.8]">
            <TxStepRow
              active={lastChanged === 'title'}
              attr="todos/title"
              value={
                <>
                  <span style={{ color: c.string }}>
                    &quot;
                    {title.length > 16 ? title.slice(0, 13) + '...' : title}
                    &quot;
                  </span>
                </>
              }
              entityId={entityId}
            />
            <TxStepRow
              active={lastChanged === 'done'}
              attr="todos/done"
              value={<span style={{ color: c.value }}>{String(done)}</span>}
              entityId={entityId}
            />
            <TxStepRow
              active={false}
              attr="todos/id"
              value={
                <span style={{ color: c.string }}>&quot;{entityId}&quot;</span>
              }
              entityId={entityId}
            />
          </div>

          {/* Postgres section */}
          <div className="flex items-center gap-2 border-b border-gray-200/60 px-4 py-2">
            <img
              src="/img/about/postgres.svg"
              alt="Postgres"
              className="h-4 w-4"
            />
            <span className="text-[10px] font-medium" style={{ color: c.text }}>
              Postgres
            </span>
          </div>
          <pre
            className="px-4 py-2.5 font-mono text-[11px] leading-[1.7]"
            style={{ color: c.text }}
          >
            <span style={{ color: c.keyword }}>INSERT INTO </span>
            triples (entity_id, attr_id, value, ...)
            {'\n'}
            <span style={{ color: c.keyword }}>VALUES</span>
            {'\n'}
            <motion.span
              className="inline-block w-full rounded"
              animate={flashAnim(lastChanged === 'title')}
              transition={{ duration: 1 }}
            >
              {'  ('}
              <span style={{ color: c.string }}>
                &apos;{entityId}&apos;
              </span>,{' '}
              <span style={{ color: c.string }}>&apos;todos/title&apos;</span>,{' '}
              <span style={{ color: c.string }}>
                &apos;{title.length > 14 ? title.slice(0, 11) + '...' : title}
                &apos;
              </span>
              , ...),
            </motion.span>
            {'\n'}
            <motion.span
              className="inline-block w-full rounded"
              animate={flashAnim(lastChanged === 'done')}
              transition={{ duration: 1 }}
            >
              {'  ('}
              <span style={{ color: c.string }}>
                &apos;{entityId}&apos;
              </span>,{' '}
              <span style={{ color: c.string }}>&apos;todos/done&apos;</span>,{' '}
              <span style={{ color: c.value }}>{String(done)}</span>, ...),
            </motion.span>
            {'\n'}
            {'  ('}
            <span style={{ color: c.string }}>
              &apos;{entityId}&apos;
            </span>,{' '}
            <span style={{ color: c.string }}>&apos;todos/id&apos;</span>,{' '}
            <span style={{ color: c.string }}>&apos;{entityId}&apos;</span>,{' '}
            ...)
            {'\n'}
            <span style={{ color: c.keyword }}>ON CONFLICT </span>
            ...
          </pre>
        </div>
      </div>
    </div>
  );
}

function TxStepRow({
  active,
  attr,
  value,
  entityId,
}: {
  active: boolean;
  attr: string;
  value: React.ReactNode;
  entityId: string;
}) {
  return (
    <motion.div
      className="rounded"
      animate={flashAnim(active)}
      transition={{ duration: 1 }}
      style={{ color: c.text }}
    >
      <span style={{ color: c.punctuation }}>[</span>
      <span style={{ color: c.string }}>&quot;add-triple&quot;</span>
      <span style={{ color: c.punctuation }}>, </span>
      <span style={{ color: c.string }}>&quot;{entityId}&quot;</span>
      <span style={{ color: c.punctuation }}>, </span>
      <span style={{ color: c.string }}>&quot;{attr}&quot;</span>
      <span style={{ color: c.punctuation }}>, </span>
      {value}
      <span style={{ color: c.punctuation }}>]</span>
    </motion.div>
  );
}
