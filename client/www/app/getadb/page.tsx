import type { Metadata } from 'next';
import { HumanForm } from './HumanForm';
import { AgentCurlChip } from './AgentCurlChip';

export const metadata: Metadata = {
  title: 'getadb — give your agent a backend',
  description:
    "Your agents shouldn't have to ask for your login info to build apps. Get fresh credentials by curling getadb.",
};

export default function GetadbHome() {
  return (
    <main className="min-h-screen bg-[#FBF9F6] text-gray-900">
      <div className="mx-auto max-w-[760px] px-6 pt-20 pb-24 sm:px-8">
        <h1
          className="font-normal"
          style={{
            fontSize: 'clamp(34px, 4.4vw, 48px)',
            lineHeight: 1.15,
            letterSpacing: '-0.015em',
          }}
        >
          <span className="font-mono text-gray-400" aria-hidden>
            [
          </span>
          <img
            src="/img/icon/logo-512.svg"
            alt=""
            aria-hidden
            className="mx-0.5 inline-block"
            style={{
              height: '0.62em',
              width: '0.62em',
              verticalAlign: '-0.04em',
            }}
          />
          <span className="font-mono text-gray-400" aria-hidden>
            ]
          </span>
          <span className="sr-only">Instant</span>{' '}
          Give your agent a full-stack backend
        </h1>
        <p className="mt-2 text-lg text-gray-500">No sign-up necessary.</p>

        <p
          className="mt-10 text-lg text-gray-800"
          style={{ lineHeight: 1.6 }}
        >
          Got an idea for an app? Type your idea out. Copy the prompt, and your
          AI has all it needs to build you a full-stack app.
        </p>

        <HumanForm className="mt-8" />

        <div
          className="mt-10 space-y-5 text-lg text-gray-800"
          style={{ lineHeight: 1.6 }}
        >
          <p>
            When your AI{' '}
            <code className="rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[0.92em]">
              curl
            </code>
            s{' '}
            <a
              href="/getadb/guide"
              className="underline decoration-dotted underline-offset-4 hover:text-orange-600"
            >
              getadb.com/guide
            </a>
            , it gets the credentials for a full{' '}
            <a
              href="/"
              className="underline underline-offset-4 hover:text-orange-600"
            >
              Instant
            </a>{' '}
            backend. This includes a relational database, a sync engine, and
            abstractions for auth, presence, and streams.
          </p>
          <p>
            There's no need for your AI to sign up. Once you're happy with your
            app, you can simply claim it with{' '}
            <code className="rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[0.92em]">
              npx instant-cli claim
            </code>
            .
          </p>
        </div>

        <hr className="my-14 border-0 border-t border-secondary-border" />

        <h2 className="text-[22px] font-semibold">Are you an agent?</h2>
        <p
          className="mt-3 text-lg text-gray-800"
          style={{ lineHeight: 1.6 }}
        >
          If your human sent you to read this page, they want you to build an
          app with Instant.{' '}
          <code className="rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[0.92em]">
            curl getadb.com/guide
          </code>{' '}
          for credentials and instructions.
        </p>
        <div className="mt-5">
          <AgentCurlChip cmd="curl getadb.com/guide" />
        </div>
      </div>
    </main>
  );
}
