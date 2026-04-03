/**
 * InstaML pipeline visualization.
 *
 * Horizontal scroll carousel: InstaML → txSteps → Postgres.
 * Scroll position drives opacity. Uses getBoundingClientRect
 * for reliable position math.
 */

import { useEffect, useRef, useState } from 'react';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

const STEPS = ['InstaML', 'txSteps', 'Postgres'] as const;

const chevron = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path
      d="M6 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function opacityForPanel(i: number, pos: number) {
  const diff = pos - i;
  const dist = Math.abs(diff);
  if (dist < 0.01) return 1;
  if (dist >= 2) return 0.25;
  // Previous panels (diff > 0): 1 → 0.7
  if (diff > 0) return Math.max(0.25, 1 - 0.3 * dist);
  // Next panels (diff < 0): 1 → 0.4
  return Math.max(0.25, 1 - 0.6 * dist);
}

/** Get the left edge of each panel in scroll-space coordinates */
function getPanelLefts(
  scrollEl: HTMLDivElement,
  panels: (HTMLDivElement | null)[],
) {
  const elRect = scrollEl.getBoundingClientRect();
  return panels.map((p) => {
    if (!p) return 0;
    const r = p.getBoundingClientRect();
    return r.left - elRect.left + scrollEl.scrollLeft;
  });
}

/** Compute the scroll target for each step */
function getScrollTargets(
  scrollEl: HTMLDivElement,
  panels: (HTMLDivElement | null)[],
) {
  const elRect = scrollEl.getBoundingClientRect();
  const containerWidth = scrollEl.clientWidth;

  return panels.map((panel, idx) => {
    if (!panel) return 0;
    if (idx === 0) return 0;

    // Center the panel in the container
    const panelRect = panel.getBoundingClientRect();
    const panelLeft = panelRect.left - elRect.left + scrollEl.scrollLeft;
    const panelWidth = panelRect.width;
    return Math.max(0, panelLeft + panelWidth / 2 - containerWidth / 2);
  });
}

/** Convert scroll position to a 0–2 fractional index based on scroll targets */
function scrollToFractionalIndex(scrollLeft: number, targets: number[]) {
  if (scrollLeft <= targets[0]) return 0;
  if (scrollLeft >= targets[targets.length - 1]) return targets.length - 1;
  for (let i = 0; i < targets.length - 1; i++) {
    if (scrollLeft <= targets[i + 1]) {
      return i + (scrollLeft - targets[i]) / (targets[i + 1] - targets[i]);
    }
  }
  return 0;
}

export function InstaMLDemo() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const title = 'Ship the feature';
  const entityId = 'id-1';

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  function updateOpacities() {
    const el = scrollRef.current;
    const panels = panelsRef.current;
    if (!el || !panels[0] || !panels[1] || !panels[2]) return;

    const targets = getScrollTargets(el, panels);
    const pos = scrollToFractionalIndex(el.scrollLeft, targets);

    panels.forEach((p, i) => {
      if (p) p.style.opacity = String(opacityForPanel(i, pos));
    });

    setStep(Math.round(pos));
  }

  function scrollToPanel(idx: number) {
    const el = scrollRef.current;
    const panels = panelsRef.current;
    if (!el || !panels[idx]) return;

    const targets = getScrollTargets(el, panels);
    const target = targets[idx];
    const start = el.scrollLeft;
    const diff = target - start;
    if (Math.abs(diff) < 1) return;

    const duration = 800;
    let t0: number | null = null;
    function tick(now: number) {
      if (!t0) t0 = now;
      const t = Math.min((now - t0) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      el!.scrollLeft = start + diff * ease;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateOpacities, { passive: true });
    // Initial opacity
    requestAnimationFrame(updateOpacities);
    return () => el.removeEventListener('scroll', updateOpacities);
  }, []);

  const nextLabel = step === 0 ? 'Generate txSteps' : 'Generate SQL';

  return (
    <div
      className="rounded-xl border border-gray-200 shadow-sm"
      style={{ backgroundColor: c.bg }}
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-gray-200/60 px-4 py-2">
        <div className="flex items-center gap-0.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              {i > 0 && <span className="mx-1 text-gray-300">{chevron}</span>}
              <button
                onClick={() => scrollToPanel(i)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium tracking-wide transition-colors ${
                  i === step
                    ? 'bg-orange-500/10 text-orange-600'
                    : i < step
                      ? 'text-gray-500 hover:text-gray-700'
                      : 'text-gray-300 hover:text-gray-500'
                }`}
              >
                {label === 'Postgres' && (
                  <img
                    src="/img/about/postgres.svg"
                    alt=""
                    className="h-3.5 w-3.5"
                  />
                )}
                {label}
              </button>
            </div>
          ))}
        </div>

        {step < 2 && (
          <button
            onClick={() => scrollToPanel(step + 1)}
            className="flex cursor-pointer items-center gap-0.5 rounded-md bg-orange-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-orange-600"
          >
            {nextLabel}
            {chevron}
          </button>
        )}
        {step === 2 && (
          <button
            onClick={() => scrollToPanel(0)}
            className="cursor-pointer text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-600"
          >
            Reset
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="relative flex min-h-[165px] items-start gap-6 overflow-x-auto px-4 py-3"
        style={{ scrollbarWidth: 'none' }}
      >
        <div
          ref={(el) => {
            panelsRef.current[0] = el;
          }}
          className="shrink-0"
          style={{ opacity: opacityForPanel(0, 0) }}
        >
          <InstaMLCode
            title={title}
            done={done}
            onToggleDone={() => setDone((d) => !d)}
          />
        </div>

        <div className="flex shrink-0 items-center self-stretch">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className="text-gray-200"
          >
            <path
              d="M7 4l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          ref={(el) => {
            panelsRef.current[1] = el;
          }}
          className="shrink-0"
          style={{ opacity: opacityForPanel(1, 0) }}
        >
          <TxStepsContent title={title} done={done} entityId={entityId} />
        </div>

        <div className="flex shrink-0 items-center self-stretch">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className="text-gray-200"
          >
            <path
              d="M7 4l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          ref={(el) => {
            panelsRef.current[2] = el;
          }}
          className="shrink-0"
          style={{ opacity: opacityForPanel(2, 0) }}
        >
          <PostgresContent title={title} done={done} entityId={entityId} />
        </div>

        {/* Spacer so last panel can scroll to center */}
        <div className="shrink-0" style={{ width: 'calc(50% - 100px)' }} />
      </div>
    </div>
  );
}

function InstaMLCode({
  title,
  done,
  onToggleDone,
}: {
  title: string;
  done: boolean;
  onToggleDone: () => void;
}) {
  return (
    <pre
      className="font-mono text-xs leading-[1.8] whitespace-pre"
      style={{ color: c.text }}
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
      {'    '}
      <span style={{ color: c.parameter }}>title</span>
      <span style={{ color: c.punctuation }}>: </span>
      <span style={{ color: c.string }}>&quot;{title}&quot;</span>
      <span style={{ color: c.punctuation }}>,</span>
      {'\n'}
      {'    '}
      <span style={{ color: c.parameter }}>done</span>
      <span style={{ color: c.punctuation }}>: </span>
      <span
        onClick={onToggleDone}
        className="cursor-pointer rounded px-0.5 font-semibold transition-colors hover:ring-1 hover:ring-orange-300"
        style={{
          backgroundColor: 'rgba(234,157,52,0.15)',
          color: c.value,
        }}
      >
        {String(done)}
      </span>
      {'\n  '}
      <span style={{ color: c.punctuation }}>{'}))'}</span>
    </pre>
  );
}

function TxStepsContent({
  title,
  done,
  entityId,
}: {
  title: string;
  done: boolean;
  entityId: string;
}) {
  return (
    <div className="font-mono text-[11px] leading-[1.8]">
      <TxStepRow entityId={entityId} attr="todos/title">
        <span style={{ color: c.string }}>&quot;{title}&quot;</span>
      </TxStepRow>
      <TxStepRow entityId={entityId} attr="todos/done">
        <span style={{ color: c.value }}>{String(done)}</span>
      </TxStepRow>
      <TxStepRow entityId={entityId} attr="todos/id">
        <span style={{ color: c.string }}>&quot;{entityId}&quot;</span>
      </TxStepRow>
    </div>
  );
}

function TxStepRow({
  entityId,
  attr,
  children,
}: {
  entityId: string;
  attr: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ color: c.text }}>
      <span style={{ color: c.punctuation }}>[</span>
      <span style={{ color: c.string }}>&quot;add-triple&quot;</span>
      <span style={{ color: c.punctuation }}>, </span>
      <span style={{ color: c.string }}>&quot;{entityId}&quot;</span>
      <span style={{ color: c.punctuation }}>, </span>
      <span style={{ color: c.string }}>&quot;{attr}&quot;</span>
      <span style={{ color: c.punctuation }}>, </span>
      {children}
      <span style={{ color: c.punctuation }}>]</span>
    </div>
  );
}

function PostgresContent({
  title,
  done,
  entityId,
}: {
  title: string;
  done: boolean;
  entityId: string;
}) {
  return (
    <pre
      className="font-mono text-[11px] leading-[1.7]"
      style={{ color: c.text }}
    >
      <span style={{ color: c.keyword }}>INSERT INTO </span>
      triples (entity_id, attr_id, value)
      {'\n'}
      <span style={{ color: c.keyword }}>VALUES</span>
      {'\n'}
      {'  ('}
      <span style={{ color: c.string }}>&apos;{entityId}&apos;</span>,{' '}
      <span style={{ color: c.string }}>&apos;todos/title&apos;</span>,{' '}
      <span style={{ color: c.string }}>&apos;{title}&apos;</span>
      ),
      {'\n'}
      {'  ('}
      <span style={{ color: c.string }}>&apos;{entityId}&apos;</span>,{' '}
      <span style={{ color: c.string }}>&apos;todos/done&apos;</span>,{' '}
      <span style={{ color: c.value }}>{String(done)}</span>),
      {'\n'}
      {'  ('}
      <span style={{ color: c.string }}>&apos;{entityId}&apos;</span>,{' '}
      <span style={{ color: c.string }}>&apos;todos/id&apos;</span>,{' '}
      <span style={{ color: c.string }}>&apos;{entityId}&apos;</span>)
    </pre>
  );
}
