import { cn } from '@/components/ui';

type TermSpan = { text: string; color?: string; bg?: string };

const green = '#5fd700';
const gray = '#d4d4d4';
const yellow = '#e5e510';
const cyan = '#00d7ff';
const dim = '#666';
const subtle = '#9a9a9a';

const promptSpans: TermSpan[] = [
  { text: 'nezaj', color: green },
  { text: ' at ', color: gray },
  { text: 'nezaj', color: yellow },
  { text: ' in ', color: gray },
  { text: '~/my-app', color: cyan },
  { text: ' at ', color: gray },
  { text: 'main\n', color: green },
  { text: '$ ', color: gray },
  { text: 'npx instant-cli push\n', color: gray },
  { text: 'Found ', color: gray },
  { text: 'NEXT_PUBLIC_INSTANT_APP_ID', color: green },
  { text: ': a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d\n', color: gray },
];

const schemaSpans: TermSpan[] = [
  { text: ' + CREATE NAMESPACE ', color: '#fff', bg: '#2ea043' },
  { text: ' todos\n', color: gray },
  { text: ' + CREATE ATTR ', color: dim },
  { text: 'todos.id\n', color: subtle },
  { text: ' + CREATE ATTR ', color: dim },
  { text: 'todos.text\n', color: subtle },
  { text: ' DATA TYPE: ', color: dim },
  { text: 'string\n', color: subtle },
  { text: ' + CREATE ATTR ', color: dim },
  { text: 'todos.done\n', color: subtle },
  { text: ' DATA TYPE: ', color: dim },
  { text: 'boolean\n', color: subtle },
  { text: ' + CREATE ATTR ', color: dim },
  { text: 'todos.createdAt\n', color: subtle },
  { text: ' DATA TYPE: ', color: dim },
  { text: 'number', color: subtle },
];

const confirmSpans: TermSpan[] = [
  { text: '\nPush these changes?\n', color: gray },
  { text: '  Push  ', color: '#fff', bg: '#c87b2e' },
  { text: '    ' },
  { text: '  Cancel  ', color: '#ccc', bg: '#555' },
];

function TermPre({
  spans,
  className,
}: {
  spans: TermSpan[];
  className?: string;
}) {
  return (
    <pre
      className={cn(
        'text-sm leading-[1.7] break-all whitespace-pre-wrap',
        className,
      )}
      style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
    >
      {spans.map((s, i) => (
        <span key={i} style={{ color: s.color, backgroundColor: s.bg }}>
          {s.text}
        </span>
      ))}
    </pre>
  );
}

export default function CLIPushCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-[#444] bg-[#1c1c1c]">
      <div className="flex items-center gap-2 border-b border-[#333] bg-[#2a2a2a] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>
      <TermPre spans={promptSpans} className="px-5 pt-4 pb-5" />
      <div className="mx-5 mb-4 rounded border border-[#444] px-4 py-3">
        <TermPre spans={schemaSpans} />
      </div>
      <TermPre spans={confirmSpans} className="px-5 pb-5" />
    </div>
  );
}
