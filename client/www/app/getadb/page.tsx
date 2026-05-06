import type { Metadata } from 'next';
import { HumanForm } from './HumanForm';

export const metadata: Metadata = {
  title: 'getadb — give your agent a backend',
  description:
    "Your agents shouldn't have to ask for your login info to build apps. Get fresh credentials by curling getadb.",
};

export default function GetadbHome() {
  return (
    <main className="min-h-screen bg-[#FBF9F6] text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <div className="flex items-start gap-3 sm:gap-4">
          <img
            src="/img/icon/logo-512.svg"
            alt="Instant"
            className="mt-1 h-8 w-8 shrink-0 sm:mt-2 sm:h-12 sm:w-12"
          />
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Give your agent a full-stack backend
          </h1>
        </div>
        <p className="mt-3 ml-11 text-lg text-gray-600 sm:ml-16">
          No sign-up necessary
        </p>

        <div className="mt-10 space-y-6 text-lg text-gray-700">
          <p>
            Got an idea for an app? Type your idea out. Copy the prompt, and
            your AI has all it needs to build you a full-stack app!
          </p>

          <HumanForm />

          <p>
            When your AI curls{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-base text-gray-800">
              getadb.com/guide
            </code>
            , it gets the credentials for a full Instant backend. This includes
            a relational database, a sync engine, and abstractions for auth,
            presence, and streams.
          </p>

          <p>
            There's no need for your AI to sign up. Once you're happy with your
            app, you can simply claim it with{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-base text-gray-800">
              npx instant-cli claim
            </code>
            .
          </p>
        </div>

        <div className="mt-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">
            Are you an agent?
          </h2>
          <p className="mt-3 text-lg text-gray-700">
            If your human sent you to read this page, they want you to build an
            app with Instant. Curl{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-base text-gray-800">
              getadb.com
            </code>{' '}
            to fetch the setup guide.
          </p>
        </div>
      </div>
    </main>
  );
}
