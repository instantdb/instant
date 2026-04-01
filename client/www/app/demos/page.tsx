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
    description: 'Image upload with progress ring and confetti',
  },
  {
    href: '/perms-demo',
    title: 'Permissions',
    description: 'Role-based access with shield cards and animated cursor',
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
