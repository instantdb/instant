import Link from 'next/link';

const basicExample = [
  {
    href: '/todo-demo-1',
    title: 'Todo',
    description: 'Scene-based todo demo with browser chrome',
  },
];

const longerExample = [
  {
    href: '/auth-demo',
    title: '1. Auth',
    description: 'Magic code sign-in flow with animated typing',
  },
  {
    href: '/perms-demo',
    title: '2. Permissions',
    description: 'Big avatars, op tabs, rule display, blur cards',
  },
  {
    href: '/reactions-demo',
    title: '3. Reactions',
    description: 'Two-window live reactions with floating emoji',
  },
  {
    href: '/storage-demo',
    title: '4. Storage',
    description: 'Image upload with progress ring and checkmark completion',
  },
  {
    href: '/stream-demo',
    title: '5. Streams',
    description: 'AI chat streaming across laptop and phone in real-time',
  },
  {
    href: '/cli-demo',
    title: '6. CLI',
    description: 'Terminal with schema push, confetti on success',
  },
];

function DemoCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group w-64 rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
    >
      <p className="text-lg font-semibold text-gray-900 group-hover:text-orange-500">
        {title}
      </p>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </Link>
  );
}

export default function DemosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="border-b border-gray-100 px-8 py-4">
        <span className="text-lg font-semibold text-gray-800">
          Launch Demos
        </span>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          Use these demos to accompany sections of the script, the demos were
          made such that they would work well even if someone wasn't watching
          the video in full screen (imagine they are on twitter). You shouldn't
          need to do a screen cap of the full page, but rather something like a
          square around the center to mostly capture the demo.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          You can refresh a page to see a demo again
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center gap-12 px-8 py-12">
        <section className="flex flex-col items-center gap-4">
          <h2 className="text-sm font-semibold tracking-wider text-gray-400 uppercase">
            Basic Example
          </h2>
          <p className="max-w-md text-center text-sm text-gray-400">
            For this demo we want a video that goes step by step matching up
            with the text from the script.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {basicExample.map((demo) => (
              <DemoCard key={demo.href} {...demo} />
            ))}
          </div>
        </section>
        <section className="flex flex-col items-center gap-4">
          <h2 className="text-sm font-semibold tracking-wider text-gray-400 uppercase">
            Longer Example
          </h2>
          <p className="max-w-md text-center text-sm text-gray-400">
            These demos correspond to the text in the longer example. No need to
            step through these, they animate on their own and just need to be
            recorded.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {longerExample.map((demo) => (
              <DemoCard key={demo.href} {...demo} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
