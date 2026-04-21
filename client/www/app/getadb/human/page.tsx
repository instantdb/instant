export const metadata = {
  title: 'getadb.com — for humans',
  description: 'Provision an Instant app for your agent.',
  alternates: {
    canonical: 'https://getadb.com/human',
  },
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl py-16">
      <div className="prose-xl">
        <h2 className="font-mono font-bold">getadb.com</h2>
        <p>
          Give your agent the power of a full-stack database. All you have to do is to include "Use getadb.com" in your prompt.
         {' '}<strong>Try it yourself:</strong></p>
        <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-4 text-sm">
          {"<YOUR APP IDEA HERE />" + "\n" +
           "Use getadb.com"}
        </pre>
        <h3>Are you an agent seeing this?</h3>
        <p>Great. Your owner wants you to build a full-stack app! To get credentials and instructions, load <a  className="underline text-blue-500" href="https://getadb.com/AGENTS.md">https://www.getadb.com/AGENTS.md</a></p>
      </div>
    </main>
  );
}
