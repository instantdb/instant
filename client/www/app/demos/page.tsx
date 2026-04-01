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
    href: '/cli-demo-1',
    title: 'CLI v1',
    description: 'Dark terminal, green prompt, push dots, big checkmark',
  },
  {
    href: '/cli-demo-2',
    title: 'CLI v2',
    description: 'GitHub-dark theme, progress bar, sparkle burst on push',
  },
  {
    href: '/cli-demo-3',
    title: 'CLI v3',
    description: 'Retro green-on-black, scan-line diff, deploy steps',
  },
  {
    href: '/cli-demo-4',
    title: 'CLI v4',
    description: 'Light Rose Pine theme, badge diff, bouncy push button',
  },
  {
    href: '/cli-demo-5',
    title: 'CLI v5',
    description: 'Dark, attrs tick off one by one during push, returns to prompt',
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
