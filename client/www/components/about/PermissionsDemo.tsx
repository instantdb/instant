import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

type Role = 'alice' | 'admin' | 'guest';

interface Order {
  id: string;
  customer: string;
  item: string;
  total: string;
}

const ORDERS: Order[] = [
  { id: '#101', customer: 'Alice', item: 'Headphones', total: '$79' },
  { id: '#102', customer: 'Bob', item: 'Keyboard', total: '$129' },
  { id: '#103', customer: 'Alice', item: 'Monitor', total: '$349' },
  { id: '#104', customer: 'Charlie', item: 'Mouse', total: '$49' },
];

const ROLES: { key: Role; label: string }[] = [
  { key: 'alice', label: 'Alice' },
  { key: 'admin', label: 'Admin' },
  { key: 'guest', label: 'Anonymous' },
];

function isVisible(order: Order, role: Role): boolean {
  if (role === 'admin') return true;
  if (role === 'alice') return order.customer === 'Alice';
  return false;
}

function evalReason(order: Order, role: Role): string {
  if (role === 'admin') return 'isAdmin → true';
  if (role === 'alice') {
    return order.customer === 'Alice'
      ? 'isOwner → true'
      : 'isOwner → false, isAdmin → false';
  }
  return 'isOwner → false, isAdmin → false';
}

type RowState = 'pending' | 'evaluating' | 'done';

export function PermissionsDemo() {
  const [role, setRole] = useState<Role>('alice');
  const [rowStates, setRowStates] = useState<RowState[]>(
    ORDERS.map(() => 'done'),
  );
  const [evaluatingRole, setEvaluatingRole] = useState<Role>(role);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
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

    return () => {
      timeouts.current.forEach(clearTimeout);
    };
  }, [role]);

  const visibleCount = ORDERS.filter((o) =>
    isVisible(o, evaluatingRole),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Permission rule */}
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
          <span style={{ color: c.string }}>
            &quot;isOwner || isAdmin&quot;
          </span>
          <span style={{ color: c.punctuation }}>,</span>
          {'\n    '}
          <span style={{ color: c.punctuation }}>{'}'}</span>
          <span style={{ color: c.punctuation }}>,</span>
          {'\n    '}
          <span style={{ color: c.parameter }}>bind</span>
          <span style={{ color: c.punctuation }}>{': {'}</span>
          {'\n      '}
          <span style={{ color: c.parameter }}>isOwner</span>
          <span style={{ color: c.punctuation }}>: </span>
          <span style={{ color: c.string }}>
            &quot;auth.id == data.customerId&quot;
          </span>
          <span style={{ color: c.punctuation }}>,</span>
          {'\n      '}
          <span style={{ color: c.parameter }}>isAdmin</span>
          <span style={{ color: c.punctuation }}>: </span>
          <span style={{ color: c.string }}>
            &quot;&apos;admin&apos; in
            auth.ref(&apos;$user.roles.type&apos;)&quot;
          </span>
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
              const visible = isVisible(order, evaluatingRole);
              const dimmed = state === 'done' && !visible;
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
                    {order.total}
                  </td>
                  <td className="relative px-4 py-1.5 font-mono text-[10px] whitespace-nowrap">
                    {/* Invisible text to reserve max width */}
                    <span className="invisible">
                      isOwner → false, isAdmin → false
                    </span>
                    <span className="absolute inset-0 flex items-center px-4">
                      {state === 'evaluating' ? (
                        <span className="text-orange-500">evaluating...</span>
                      ) : state === 'done' ? (
                        <span
                          className={
                            visible ? 'text-green-600' : 'text-red-400'
                          }
                        >
                          {evalReason(order, evaluatingRole)}
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
