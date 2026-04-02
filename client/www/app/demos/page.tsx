import Link from 'next/link';

const demos = [
  {
    href: '/auth-demo',
    title: 'Auth',
    description: 'Magic code sign-in flow with animated typing',
  },
  {
    href: '/storage-demo',
    title: 'Storage',
    description: 'Image upload with progress ring and checkmark completion',
  },
  {
    href: '/perms-demo',
    title: 'Permissions',
    description: 'Big avatars, op tabs, rule display, blur cards',
  },
  {
    href: '/reactions-demo',
    title: 'Reactions',
    description: 'Two-window live reactions with floating emoji',
  },
  {
    href: '/cli-demo',
    title: 'CLI',
    description: 'Terminal with schema push, confetti on success',
  },
  {
    href: '/stream-demo',
    title: 'Streams',
    description: 'AI chat streaming across laptop and phone in real-time',
  },
  {
    href: '/todo-demo-1',
    title: 'Todo v1',
    description: 'Smooth crossfade code badge, soft green glow on persist',
  },
  {
    href: '/todo-demo-2',
    title: 'Todo v2',
    description: 'Inline code morph with typing animation',
  },
  {
    href: '/todo-demo-3',
    title: 'Todo v3',
    description: 'Minimal badge, emphasis on the app UI itself',
  },
  {
    href: '/todo-demo-4',
    title: 'Todo v4',
    description: 'Code panel slides up from card, two-column realtime',
  },
  {
    href: '/todo-demo-5',
    title: 'Todo v5',
    description: 'Tab-style code badge with before/after toggle',
  },
];

export default function DemosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex items-center border-b border-gray-100 px-8 py-4">
        <span className="text-lg font-semibold text-gray-800">
          Launch Demos
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="flex flex-wrap justify-center gap-6">
          {demos.map((demo) => (
            <Link
              key={demo.href}
              href={demo.href}
              className="group w-64 rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <p className="text-lg font-semibold text-gray-900 group-hover:text-orange-500">
                {demo.title}
              </p>
              <p className="mt-1 text-sm text-gray-500">{demo.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
