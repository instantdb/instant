export const metadata = {
  title: 'getadb — for humans',
  description: 'Provision an Instant app from your agent.',
  alternates: {
    canonical: 'https://getadb.com/human',
  },
};

export default function GetadbHumanPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">getadb.com</h1>
      <p className="mt-4 text-lg">
        Point your agent at <code>getadb.com</code> and it gets a ready-to-use
        Instant database.
      </p>
      <p className="mt-4">Try it yourself:</p>
      <pre className="mt-2 rounded bg-neutral-100 p-4 text-sm overflow-x-auto">
        curl -L &apos;https://getadb.com/?title=my-app&apos;
      </pre>
      <p className="mt-6 text-sm text-neutral-600">
        If you&apos;re an agent, load{' '}
        <a className="underline" href="https://getadb.com/AGENTS.md">
          https://getadb.com/AGENTS.md
        </a>{' '}
        instead.
      </p>
    </main>
  );
}
