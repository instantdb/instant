import { useState } from 'react';
import { motion } from 'motion/react';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

type Role = 'bob' | 'admin' | 'guest';

interface Vote {
  id: string;
  voter: string;
  choice: string;
}

const VOTES: Vote[] = [
  { id: 'v1', voter: 'Alice', choice: 'Option A' },
  { id: 'v2', voter: 'Bob', choice: 'Option B' },
  { id: 'v3', voter: 'Charlie', choice: 'Option A' },
  { id: 'v4', voter: 'Diana', choice: 'Option C' },
];

const ROLES: { key: Role; label: string; description: string }[] = [
  { key: 'bob', label: 'Bob', description: 'Can see own vote' },
  { key: 'admin', label: 'Admin', description: 'Can see all votes' },
  { key: 'guest', label: 'Guest', description: 'Can see no votes' },
];

function isVisible(vote: Vote, role: Role): boolean {
  if (role === 'admin') return true;
  if (role === 'bob') return vote.voter === 'Bob';
  return false;
}

export function PermissionsDemo() {
  const [role, setRole] = useState<Role>('bob');

  const visibleCount = VOTES.filter((v) => isVisible(v, role)).length;

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
          {'\n  '}votes
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
            &quot;auth.id == data.voterId&quot;
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
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
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

      {/* Votes table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 py-2">
          <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
            Votes
          </span>
          <span className="text-[10px] text-gray-400">
            {visibleCount} of {VOTES.length} visible
          </span>
        </div>
        <div className="grid grid-cols-3 border-b border-gray-100 text-[10px] text-gray-400">
          <div className="px-4 py-1.5 font-medium">id</div>
          <div className="px-4 py-1.5 font-medium">voter</div>
          <div className="px-4 py-1.5 font-medium">choice</div>
        </div>
        {VOTES.map((vote) => {
          const visible = isVisible(vote, role);
          return (
            <motion.div
              key={vote.id}
              className="grid grid-cols-3 border-b border-gray-50"
              animate={{
                opacity: visible ? 1 : 0.25,
              }}
              transition={{ duration: 0.2 }}
            >
              <div className="px-4 py-1.5 font-mono text-[11px] text-gray-500">
                {vote.id}
              </div>
              <div className="px-4 py-1.5 font-mono text-[11px] text-gray-500">
                {visible ? vote.voter : '••••'}
              </div>
              <div className="px-4 py-1.5 font-mono text-[11px] text-gray-700">
                {visible ? vote.choice : '••••'}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
