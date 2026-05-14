import { HumanForm } from './HumanForm';

type GetadbLandingProps = {
  guideHref?: string;
  guideLabel?: string;
  guideVerb?: string;
  humanFormSuffix?: string;
  agentCommand?: string;
};

const DEFAULT_GUIDE_HREF = 'https://www.getadb.com/guide';
const DEFAULT_GUIDE_LABEL = 'getadb.com/guide';

export function GetadbLanding({
  guideHref = DEFAULT_GUIDE_HREF,
  guideLabel = DEFAULT_GUIDE_LABEL,
  guideVerb = 'fetches',
  humanFormSuffix,
  agentCommand = `curl '${DEFAULT_GUIDE_HREF}'`,
}: GetadbLandingProps) {
  return (
    <main className="text-off-black min-h-screen bg-[#FBF9F6]">
      <div className="landing-width mx-auto pt-8 pb-24 sm:pt-12">
        <div className="mx-auto max-w-3xl">
          <img
            src="/img/icon/logo-512.svg"
            alt="Instant"
            className="mb-5 h-10 w-10 sm:mb-6 sm:h-12 sm:w-12"
          />
          <h1 className="text-3xl leading-snug font-normal sm:text-4xl">
            Give your agent a full-stack backend
          </h1>
          <p className="mt-3 text-lg text-gray-500 sm:text-xl">
            No sign-up necessary.
          </p>

          <p className="mt-6 text-lg leading-relaxed text-gray-700">
            Got an idea for an app? Type your idea out. Copy the prompt, and
            your AI has all it needs to build you a full-stack app.
          </p>

          <HumanForm className="mt-8" suffix={humanFormSuffix} />

          <div className="mt-8 space-y-5 text-lg leading-relaxed text-gray-700">
            <p>
              Pass this on to your Claude, Codex, Opencode, Pi, or your favorite
              agent.
            </p>
            <p>
              When your AI {guideVerb}{' '}
              <a
                href={guideHref}
                className="underline underline-offset-4 hover:text-orange-600"
              >
                {guideLabel}
              </a>
              , it gets the credentials for a full{' '}
              <a
                href="/"
                className="underline underline-offset-4 hover:text-orange-600"
              >
                Instant
              </a>{' '}
              backend. This includes a relational database, a sync engine, and
              abstractions for auth, presence, and streams. Your agent can build
              your app and won't be blocked with sign-up screens or dashboards.
            </p>
            <p>
              Once you're happy with your app, you can simply claim it with{' '}
              <code className="rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[0.92em]">
                npx instant-cli claim
              </code>
              .
            </p>
          </div>

          <p className="mt-10 text-lg leading-relaxed text-gray-700">
            <strong className="font-semibold text-gray-900">
              Are you an agent?
            </strong>{' '}
            Your human wants you to build an app with Instant. {agentCommand}{' '}
            for credentials and instructions.
          </p>
        </div>
      </div>
    </main>
  );
}
