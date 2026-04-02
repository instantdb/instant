import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  getCelEnv,
  parseCelError,
  makeRefable,
  type CelError,
} from '@/lib/cel';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

type Role = 'alice' | 'admin' | 'guest';

const REF_DATA: Record<string, Record<string, unknown[]>> = {
  alice: { '$user.roles.type': ['user'] },
  admin_user: { '$user.roles.type': ['admin', 'user'] },
  guest_user: { '$user.roles.type': [] },
};

// ---------------------------------------------------------------------------
// Order display data
// ---------------------------------------------------------------------------

interface Order {
  id: number;
  customer: string;
  customerId: string;
  item: string;
  total: number;
}

const ORDERS: Order[] = [
  {
    id: 101,
    customer: 'Alice',
    customerId: 'alice',
    item: 'Headphones',
    total: 79,
  },
  { id: 102, customer: 'Bob', customerId: 'bob', item: 'Keyboard', total: 129 },
  {
    id: 103,
    customer: 'Alice',
    customerId: 'alice',
    item: 'Monitor',
    total: 349,
  },
  {
    id: 104,
    customer: 'Charlie',
    customerId: 'charlie',
    item: 'Mouse',
    total: 49,
  },
];

const ROLES: { key: Role; label: string }[] = [
  { key: 'alice', label: 'Alice' },
  { key: 'admin', label: 'Admin' },
  { key: 'guest', label: 'Anonymous' },
];

function getAuthContext(role: Role) {
  switch (role) {
    case 'alice':
      return makeRefable('alice', REF_DATA, {
        id: 'alice',
        email: 'alice@example.com',
      });
    case 'admin':
      return makeRefable('admin_user', REF_DATA, {
        id: 'admin_user',
        email: 'admin@example.com',
      });
    case 'guest':
      return makeRefable('guest_user', REF_DATA, { id: 'guest_user' });
  }
}

function getDataContext(order: Order) {
  return {
    customerId: order.customerId,
    item: order.item,
    total: order.total,
  };
}

// ---------------------------------------------------------------------------
// CEL evaluation
// ---------------------------------------------------------------------------

interface EvalResult {
  binds: Record<string, boolean>;
  allowed: boolean;
  error?: CelError;
}

// Fast path: hardcoded results for the default rules
function evaluateDefault(order: Order, role: Role): EvalResult {
  const isOwner = role === 'alice' && order.customerId === 'alice';
  const isAdmin = role === 'admin';
  return { binds: { isOwner, isAdmin }, allowed: isOwner || isAdmin };
}

// Slow path: actually run CEL when user has edited rules
async function evaluateCEL(
  order: Order,
  role: Role,
  viewRule: string,
  binds: { name: string; expr: string }[],
): Promise<EvalResult> {
  const celEnv = await getCelEnv();
  const auth = getAuthContext(role);
  const data = getDataContext(order);
  const ctx = {
    auth,
    data,
    math: {},
    request: {
      modifiedFields: [],
      time: new Date(),
      ip: '127.0.0.1',
      origin: 'www.instantdb.com',
    },
    newData: {},
    linkedData: {},
    ruleParams: {},
  };

  try {
    const bindResults: Record<string, boolean> = {};
    for (const bind of binds) {
      bindResults[bind.name] = Boolean(celEnv.evaluate(bind.expr, ctx));
    }
    const allowed = Boolean(
      celEnv.evaluate(viewRule, { ...bindResults, ...ctx }),
    );
    return { binds: bindResults, allowed };
  } catch (e: unknown) {
    return {
      binds: {},
      allowed: false,
      error: parseCelError(e),
    };
  }
}

function formatResult(result: EvalResult, viewRule: string): string {
  if (result.error) return 'error';
  const relevantBinds = Object.entries(result.binds).filter(([name]) =>
    viewRule.includes(name),
  );
  if (relevantBinds.length === 0) {
    return `→ ${result.allowed}`;
  }
  const parts = relevantBinds.map(([name, val]) => `${name} → ${val}`);
  return parts.join(', ');
}

type RowState = 'pending' | 'evaluating' | 'done';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_VIEW_RULE = 'isOwner || isAdmin';
const DEFAULT_BINDS = [
  { name: 'isOwner', expr: 'auth.id == data.customerId' },
  { name: 'isAdmin', expr: "'admin' in auth.ref('$user.roles.type')" },
];

export function PermissionsDemo() {
  const [role, setRole] = useState<Role>('alice');
  const [viewRule, setViewRule] = useState(DEFAULT_VIEW_RULE);
  const binds = DEFAULT_BINDS;
  const [edited, setEdited] = useState(false);

  const [rowStates, setRowStates] = useState<RowState[]>(
    ORDERS.map(() => 'done'),
  );
  const [evaluatingRole, setEvaluatingRole] = useState<Role>(role);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const runAnimation = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    setRowStates(ORDERS.map(() => 'pending'));
    setEvaluatingRole(role);

    const delay = 300;

    ORDERS.forEach((_, i) => {
      timeouts.current.push(
        setTimeout(() => {
          setRowStates((prev) => {
            const next = [...prev];
            next[i] = 'evaluating';
            return next;
          });
        }, i * delay),
      );

      timeouts.current.push(
        setTimeout(
          () => {
            setRowStates((prev) => {
              const next = [...prev];
              next[i] = 'done';
              return next;
            });
          },
          i * delay + delay * 0.7,
        ),
      );
    });
  };

  useEffect(() => {
    runAnimation();
    return () => {
      timeouts.current.forEach(clearTimeout);
    };
  }, [role]);

  const [celResults, setCelResults] = useState<EvalResult[] | null>(null);

  // Run CEL evaluation when rules are edited
  useEffect(() => {
    if (!edited) {
      setCelResults(null);
      return;
    }
    let cancelled = false;
    Promise.all(
      ORDERS.map((order) =>
        evaluateCEL(order, evaluatingRole, viewRule, binds),
      ),
    ).then((r) => {
      if (!cancelled) setCelResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, [edited, evaluatingRole, viewRule, binds]);

  const results =
    edited && celResults
      ? celResults
      : ORDERS.map((order) => evaluateDefault(order, evaluatingRole));

  const visibleCount = results.filter((r) => r.allowed).length;

  const updateViewRule = (v: string) => {
    setViewRule(v);
    setEdited(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Permission rule — editable */}
      <div
        className="overflow-hidden rounded-lg border border-gray-200"
        style={{ backgroundColor: c.bg }}
      >
        <div className="flex items-center border-b border-gray-200/60 px-3 py-1.5">
          <span className="text-xs font-medium" style={{ color: c.text }}>
            instant.perms.ts
          </span>
        </div>
        <pre
          className="px-4 py-3 font-mono text-[11px] leading-[1.8]"
          style={{ color: c.text }}
        >
          <span style={{ color: c.keyword }}>const </span>
          rules
          <span style={{ color: c.punctuation }}> = {'{'}</span>
          {'\n  '}orders
          <span style={{ color: c.punctuation }}>{': {'}</span>
          {'\n    '}
          <span style={{ color: c.parameter }}>allow</span>
          <span style={{ color: c.punctuation }}>{': {'}</span>
          {'\n      '}
          <span style={{ color: c.parameter }}>view</span>
          <span style={{ color: c.punctuation }}>: </span>
          <span style={{ color: c.string }}>&quot;</span>
          <EditableSpan
            value={viewRule}
            onChange={updateViewRule}
            color={c.string}
            error={results[0]?.error}
          />
          <span style={{ color: c.string }}>&quot;</span>
          <span style={{ color: c.punctuation }}>,</span>
          {'\n    '}
          <span style={{ color: c.punctuation }}>{'}'}</span>
          <span style={{ color: c.punctuation }}>,</span>
          {'\n    '}
          <span style={{ color: c.parameter }}>bind</span>
          <span style={{ color: c.punctuation }}>{': {'}</span>
          {binds.map((bind, i) => (
            <span key={bind.name}>
              {'\n      '}
              <span style={{ color: c.parameter }}>{bind.name}</span>
              <span style={{ color: c.punctuation }}>: </span>
              <span style={{ color: c.string }}>&quot;{bind.expr}&quot;</span>
              {i < binds.length - 1 && (
                <span style={{ color: c.punctuation }}>,</span>
              )}
            </span>
          ))}
          {'\n    '}
          <span style={{ color: c.punctuation }}>{'}'}</span>
          {'\n  '}
          <span style={{ color: c.punctuation }}>{'}'}</span>
          {'\n'}
          <span style={{ color: c.punctuation }}>{'}'}</span>
          <span style={{ color: c.punctuation }}>;</span>
        </pre>
      </div>

      {/* Role selector */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400">Viewing as:</span>
        <div className="flex gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRole(r.key)}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                role === r.key
                  ? 'border-orange-600 bg-orange-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 py-2">
          <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
            Orders
          </span>
          <span className="text-[10px] text-gray-400">
            {visibleCount} of {ORDERS.length} visible
          </span>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] text-gray-400">
              <th className="px-4 py-1.5 font-medium">id</th>
              <th className="px-4 py-1.5 font-medium">customer</th>
              <th className="px-4 py-1.5 font-medium">item</th>
              <th className="px-4 py-1.5 text-right font-medium">total</th>
              <th className="px-4 py-1.5 font-medium">rule</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((order, i) => {
              const state = rowStates[i];
              const result = results[i];
              const dimmed = state === 'done' && !result.allowed;
              const dimClass = dimmed
                ? 'text-gray-400 line-through'
                : 'text-gray-600';

              return (
                <motion.tr
                  key={order.id}
                  className="border-b border-gray-50"
                  animate={{
                    backgroundColor:
                      state === 'evaluating'
                        ? 'rgba(249,115,22,0.08)'
                        : 'rgba(249,115,22,0)',
                  }}
                  transition={{ duration: 0.15 }}
                >
                  <td
                    className={`px-4 py-1.5 font-mono text-[11px] ${dimClass}`}
                  >
                    {order.id}
                  </td>
                  <td
                    className={`px-4 py-1.5 font-mono text-[11px] ${dimClass}`}
                  >
                    {order.customer}
                  </td>
                  <td
                    className={`px-4 py-1.5 font-mono text-[11px] ${dimClass}`}
                  >
                    {order.item}
                  </td>
                  <td
                    className={`px-4 py-1.5 text-right font-mono text-[11px] ${dimClass}`}
                  >
                    ${order.total}
                  </td>
                  <td className="relative px-4 py-1.5 font-mono text-[10px] whitespace-nowrap">
                    <span className="invisible">
                      isOwner → false, isAdmin → false
                    </span>
                    <span className="absolute inset-0 flex items-center px-4">
                      {state === 'evaluating' ? (
                        <span className="text-orange-500">evaluating...</span>
                      ) : state === 'done' ? (
                        <span
                          className={
                            result.error
                              ? 'text-red-500'
                              : result.allowed
                                ? 'text-green-600'
                                : 'text-red-400'
                          }
                        >
                          {result.error
                            ? 'error'
                            : formatResult(result, viewRule)}
                        </span>
                      ) : null}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditableSpan({
  value,
  onChange,
  color,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  color: string;
  error?: CelError;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Approximate ch width for monospace at 11px
  const chWidth = 6.6;

  return (
    <span className="relative inline-block">
      <span
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain').replace(/\n/g, '');
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const text = (ref.current?.textContent || '').replace(/\n/g, '');
            onChange(text);
            ref.current?.blur();
          }
        }}
        onBlur={() => {
          const text = (ref.current?.textContent || '').replace(/\n/g, '');
          if (text !== value) onChange(text);
        }}
        className="inline-block min-w-[2ch] cursor-text rounded-sm outline-none focus:ring-1 focus:ring-orange-300"
        style={{
          color,
          borderBottom: error
            ? '1px wavy red'
            : '1px dashed rgba(234,157,52,0.5)',
        }}
      >
        {value}
      </span>
      {error && (
        <span
          className="absolute top-full z-10 mt-0.5 flex flex-col items-start whitespace-nowrap text-red-500"
          style={{ left: error.column != null ? error.column * chWidth : 0 }}
        >
          <span className="text-[11px] leading-none">^</span>
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] shadow-sm">
            {error.message}
          </span>
        </span>
      )}
    </span>
  );
}
