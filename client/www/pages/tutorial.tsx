import React, { useState } from 'react';
import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
import { Section } from '@/components/new-landing/Section';
import {
  SectionTitle,
  SectionSubtitle,
  Subheading,
  LandingButton,
} from '@/components/new-landing/typography';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';
import { XIcon } from '@/components/new-landing/icons';
import { AnimateIn } from '@/components/new-landing/AnimateIn';
import RatingBox from '@/components/docs/RatingBox';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import clsx from 'clsx';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import CopyToClipboard from 'react-copy-to-clipboard';
import { AnimatePresence, motion } from 'motion/react';

// -----------
// Data
// -----------

const overviewSteps = [
  'Login to Instant in the terminal',
  'Scaffold a starter Instant app',
  'Prompt an LLM to build us an app (This is the fun part!)',
  'Deploy the app to Vercel',
];

const packageManagers = [
  { id: 'npm', name: 'npx', runner: 'npx', scriptRunner: 'npm' },
  { id: 'pnpm', name: 'pnpx', runner: 'pnpx', scriptRunner: 'pnpm' },
  { id: 'bun', name: 'bunx', runner: 'bunx', scriptRunner: 'bun' },
] as const;

const examplePrompts = [
  {
    title: 'Habit Tracker',
    content:
      'Create a habit tracking app where users can create habits, mark daily completions, and visualize streaks. Include features for setting habit frequency (daily/weekly), viewing completion calendars, and tracking overall progress percentages.\n\nKeep the code to < 1000 lines.\n\nSeed with 5-6 sample habits like "Exercise", "Read", "Meditate" with 30 days of completion history.',
  },
  {
    title: 'Trivia Game',
    content:
      'Use InstantDB to create a trivia game with multiple-choice questions, score tracking, and category selection. Players should see immediate feedback on answers, track their high scores, and compete on a leaderboard.\n\nKeep the code to < 1000 lines.\n\nSeed with 30-40 questions across categories like "Science", "History", "Sports", and "Entertainment".',
  },
  {
    title: 'Job Board',
    content:
      'Build a job board app where employers can post jobs and job seekers can browse and save listings. Include filtering by job type, location, and salary range, plus a simple application tracking system.\n\nKeep the code to < 1000 lines.\n\nSeed with 15-20 job listings across categories like "Engineering", "Design", "Marketing" with various companies and locations.',
  },
];

const debuggingItems: {
  id: string;
  title: string;
  content: React.ReactNode;
  videoUrl?: string;
}[] = [
  {
    id: 'general-troubleshooting',
    title: 'General troubleshooting',
    content: (
      <div className="space-y-3">
        <p>
          If you encounter an error we should hopefully bubble up a message to
          you that you can just copy and paste to your agent to fix.
        </p>
        <p>
          If you encounter an issue not listed below please feel free to let us
          know via the feedback tool at the bottom of this page or via our{' '}
          <a
            href="https://discord.com/invite/VU53p7uQcE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Discord
          </a>
          .
        </p>
      </div>
    ),
  },
  {
    id: 'validation-query',
    title: 'Validation failed for query',
    videoUrl: 'https://youtu.be/8K1Uk98od_c',
    content: (
      <p>
        If you see this you'll likely see a few sentences describing the error.
        You should be able to copy and paste the error message to your agent and
        it will figure it out.
      </p>
    ),
  },
  {
    id: 'validation-tx',
    title: 'Validation failed for tx-steps',
    videoUrl: 'https://youtu.be/lYElXb_KpaM',
    content: (
      <p>
        This will most likely happen when referencing an invalid id in{' '}
        <code>transact</code>. To resolve this open up your browser's dev tools
        and copy/paste the error into your agent. Tell it you think the problem
        is related to not using <code>id()</code> in transact. This should do
        the trick!
      </p>
    ),
  },
  {
    id: 'missing-attributes',
    title: 'Missing required attributes',
    videoUrl: 'https://youtu.be/jGvSFMhxr74',
    content: (
      <p>
        You may encounter this when you are trying to add or delete data. What's
        likely happening is some entity has a required link. To resolve this
        open up your browser's dev tools and copy/paste the error into your
        agent. Tell it you think the problem is related to required attributes
        and the fix is to update schema with an onDelete cascade. This should do
        the trick!
      </p>
    ),
  },
  {
    id: 'permission-denied',
    title: 'Permission denied: not perms-pass?',
    videoUrl: 'https://youtu.be/tCYKYRaxk-g',
    content: (
      <p>
        This can happen if an invalid or unexpected permission rule was pushed.
        The behavior will look similar to validation failure where{' '}
        <code>transact</code> fails and rolls-back a change. To resolve this
        open up your browser's dev tools and copy/paste the error into your
        agent. Tell it the problem is related to permissions and have it push up
        a fix.
      </p>
    ),
  },
  {
    id: 'dev-server',
    title: 'Dev server not running',
    content: (
      <div className="space-y-3">
        <p>
          Sometimes agents like Cursor or Claude will say the dev server is
          running when it's actually not. The agent may have ran the server to
          test something but it will shut it off once it's done. Just do{' '}
          <code>npm run dev</code> in your terminal and open up localhost.
        </p>
        <p>
          Similarly sometimes the agent will run <code>npm run build</code> to
          detect and fix any typescript issues. This may break your currently
          running dev server. Simply restart your dev server to continue along.
        </p>
      </div>
    ),
  },
];

// -----------
// Reusable components
// -----------

function ConfettiParticle({
  delay,
  x,
  color,
}: {
  delay: number;
  x: number;
  color: string;
}) {
  return (
    <motion.div
      className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: color }}
      initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      animate={{
        opacity: [1, 1, 0],
        x: x,
        y: [0, -20 - Math.random() * 15, 10 + Math.random() * 10],
        scale: [1, 1.2, 0.5],
      }}
      transition={{
        duration: 0.6,
        delay,
        ease: 'easeOut',
      }}
    />
  );
}

const confettiColors = [
  '#F97316',
  '#FB923C',
  '#3B82F6',
  '#A855F7',
  '#EC4899',
  '#10B981',
];

function TerminalCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <CopyToClipboard
      text={text}
      onCopy={() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <button className="relative flex h-9 w-9 items-center justify-center overflow-hidden text-white transition-opacity hover:opacity-70">
        <AnimatePresence initial={false} custom={copied}>
          <motion.span
            key={copied ? 'copied' : 'copy'}
            custom={copied}
            className="absolute inset-0 flex items-center justify-center"
            variants={{
              enter: (isCopied: boolean) => ({ y: isCopied ? -24 : 24 }),
              center: { y: 0 },
              exit: (isCopied: boolean) => ({ y: isCopied ? 24 : -24 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {copied ? (
              <CheckIcon className="h-5 w-5 text-green-400" />
            ) : (
              <ClipboardDocumentIcon className="h-5 w-5" />
            )}
          </motion.span>
        </AnimatePresence>
        {copied && (
          <>
            {confettiColors.map((color, i) => (
              <ConfettiParticle
                key={i}
                delay={i * 0.03}
                x={(i % 2 === 0 ? -1 : 1) * (12 + i * 6)}
                color={color}
              />
            ))}
          </>
        )}
      </button>
    </CopyToClipboard>
  );
}

function PackageManagerTabs({
  selectedPmIndex,
  onPmChange,
}: {
  selectedPmIndex: number;
  onPmChange: (index: number) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-gray-100 p-1">
      {packageManagers.map((pm, i) => {
        return (
          <button
            key={pm.id}
            onClick={() => onPmChange(i)}
            className={clsx(
              'flex items-center rounded-full px-4 py-1.5 font-mono text-sm font-medium transition-colors',
              selectedPmIndex === i
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {pm.name}
          </button>
        );
      })}
    </div>
  );
}

function TerminalBlock({
  commandTemplate,
  type = 'runner',
  selectedPmIndex,
  onPmChange,
}: {
  commandTemplate: string;
  type?: 'runner' | 'script';
  selectedPmIndex: number;
  onPmChange?: (index: number) => void;
}) {
  const pm = packageManagers[selectedPmIndex];
  const prefix = type === 'script' ? pm.scriptRunner : pm.runner;
  const command = `${prefix} ${commandTemplate}`;

  return (
    <div>
      {onPmChange && (
        <div className="mb-3 flex justify-end">
          <PackageManagerTabs
            selectedPmIndex={selectedPmIndex}
            onPmChange={onPmChange}
          />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between px-6 py-4 font-mono text-base font-normal">
          <div>
            <span className="text-green-400">$ </span>
            <span className="text-white">{command}</span>
          </div>
          <TerminalCopyButton text={command} />
        </div>
      </div>
    </div>
  );
}

function TabbedPrompts() {
  const [activeTab, setActiveTab] = useState(0);
  const prompt = examplePrompts[activeTab];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-2">
        <div className="flex gap-1">
          {examplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === i
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              {p.title}
            </button>
          ))}
        </div>
        <TerminalCopyButton text={prompt.content} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="p-6 font-mono text-base whitespace-pre-wrap text-white"
        >
          {prompt.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function DebuggingSection() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id);
    } else {
      newOpenItems.add(id);
    }
    setOpenItems(newOpenItems);
  };

  return (
    <div className="relative overflow-hidden bg-[#F8F8F8]">
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-24 bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-24 bg-gradient-to-b from-transparent to-white" />
      <div className="relative z-10">
        <Section>
          <AnimateIn>
            <div className="text-center">
              <Subheading>Debugging Common Issues</Subheading>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-700">
                Run into an issue? Here are solutions to common problems you
                might encounter:
              </p>
            </div>
            <div className="mx-auto mt-10 max-w-3xl space-y-3">
              {debuggingItems.map((item) => {
                const isOpen = openItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                  >
                    <button
                      onClick={() => toggleItem(item.id)}
                      className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-hidden"
                    >
                      <span className="font-medium text-gray-900">
                        {item.title}
                      </span>
                      <motion.svg
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="h-5 w-5 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </motion.svg>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-gray-100 px-5 pt-4 pb-5 text-gray-700">
                            <div className="space-y-4">
                              {item.content}
                              {item.videoUrl && (
                                <div className="pt-2">
                                  <a
                                    href={item.videoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                  >
                                    <svg
                                      className="h-4 w-4"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                                    </svg>
                                    <span>Watch debugging video</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </AnimateIn>
        </Section>
      </div>
    </div>
  );
}

// -----------
// Page
// -----------

const pageTitle = 'Whirlwind tour: Build a full-stack app with InstantDB';

export default function Tutorial() {
  const [selectedPmIndex, setSelectedPmIndex] = useLocalStorage<number>(
    'package-manager-index',
    0,
  );

  return (
    <div className="text-off-black w-full">
      <Head>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content="Build full-stack apps with InstantDB in 5-10 minutes!"
        />
      </Head>

      {/* Hero band */}
      <div className="relative pt-16">
        <TopWash />
        <MainNav transparent />
        <div className="landing-width relative mx-auto px-8 pt-16 pb-12">
          <div className="mx-auto max-w-3xl">
            <SectionTitle>{pageTitle}</SectionTitle>
            <p className="mt-6 text-lg text-gray-700">
              In this tutorial we'll walk through creating a full-stack app with
              InstantDB.{' '}
              <b>
                Within 5-10 minutes you'll have an app that runs on your
                computer
              </b>
              , and if you like, can be deployed into the wild!
            </p>

            {/* Table of contents */}
            <ol className="mt-8 space-y-2">
              {overviewSteps.map((step, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-lg text-gray-700">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div className="landing-width mx-auto px-8">
        <div className="mx-auto max-w-3xl">
          {/* Step 1: Login */}
          <AnimateIn>
            <div className="py-10">
              <div className="mb-3 text-lg font-medium text-orange-600">
                Step 1
              </div>
              <Subheading>Log in to Instant via instant-cli</Subheading>
              <div className="mt-4 space-y-4 text-lg text-gray-700">
                <p>
                  As a first step let's make sure you're logged in. Run the
                  following command in the terminal with your favorite package
                  manager.
                </p>
              </div>
              <div className="mt-6">
                <TerminalBlock
                  commandTemplate="instant-cli login"
                  selectedPmIndex={selectedPmIndex}
                  onPmChange={setSelectedPmIndex}
                />
              </div>
              <p className="mt-4 text-lg text-gray-700">
                This will open up a browser window where you can log in to your
                Instant account or sign up if you don't have one yet.
              </p>
            </div>
          </AnimateIn>

          {/* Step 2: Scaffold */}
          <AnimateIn>
            <div className="py-10">
              <div className="mb-3 text-lg font-medium text-orange-600">
                Step 2
              </div>
              <Subheading>Scaffold a starter instant app</Subheading>
              <div className="mt-4 space-y-4 text-lg text-gray-700">
                <p>
                  Now that you're authenticated any app you make will persist
                  unless you delete the data later — woohoo!
                </p>
                <p>
                  As a next step we'll use <b>create-instant-app</b>, our CLI
                  tool, which makes it super easy to get started with a new
                  Instant project. Run the following in your terminal.
                </p>
              </div>
              <div className="mt-6">
                <TerminalBlock
                  commandTemplate="create-instant-app"
                  selectedPmIndex={selectedPmIndex}
                  onPmChange={setSelectedPmIndex}
                />
              </div>
              <p className="mt-4 text-lg text-gray-700">
                Go through the prompts to select your framework and llm. Once
                the app is generated change into the new directory and go on to
                step 3!
              </p>
            </div>
          </AnimateIn>

          {/* Step 3: Prompt */}
          <AnimateIn>
            <div className="py-10">
              <div className="mb-3 text-lg font-medium text-orange-600">
                Step 3
              </div>
              <Subheading>
                Prompt the LLM to build us an app! (This is the fun part!)
              </Subheading>
              <div className="mt-4 space-y-4 text-lg text-gray-700">
                <p>
                  Woohoo! Now that we've got everything set up, we're ready to
                  build an app! Fire up your editor (cursor, windsurf, zed,
                  etc.) or your CLI tool (claude, gemini, etc) and type up a
                  prompt. Hit enter and watch the magic happen!
                </p>
                <p>Here are some example prompts for inspiration</p>
              </div>
              <div className="mt-6">
                <TabbedPrompts />
              </div>
            </div>
          </AnimateIn>
        </div>
      </div>

      {/* Debugging */}
      <DebuggingSection />

      {/* Step 4: Deploy */}
      <div className="landing-width mx-auto px-8">
        <div className="mx-auto max-w-3xl">
          <AnimateIn>
            <div className="pt-10">
              <div className="mb-3 text-lg font-medium text-orange-600">
                Step 4
              </div>
              <Subheading>Deploy the app to Vercel</Subheading>
              <div className="mt-4 space-y-4 text-lg text-gray-700">
                <p>
                  Once you've got a working app we can get it live by deploying
                  to Vercel! Before we deploy, let's verify there are no build
                  errors. In the terminal run:
                </p>
              </div>
            </div>
          </AnimateIn>
          <div className="mt-6">
            <TerminalBlock
              commandTemplate="run build"
              type="script"
              selectedPmIndex={selectedPmIndex}
              onPmChange={setSelectedPmIndex}
            />
          </div>
          <div className="mt-4 space-y-4 text-lg text-gray-700">
            <p>
              If there are build errors, paste them into your agent to get them
              fixed up. Make sure your app still works as expected after your
              agent gets the build to pass:
            </p>
          </div>
          <div className="mt-6">
            <TerminalBlock
              commandTemplate="run dev"
              type="script"
              selectedPmIndex={selectedPmIndex}
            />
          </div>
          <div className="mt-4 space-y-4 text-lg text-gray-700">
            <p>If all looks well let's kick off a deploy!</p>
          </div>
          <div className="mt-6">
            <TerminalBlock
              commandTemplate="vercel --prod"
              selectedPmIndex={selectedPmIndex}
            />
          </div>
          <div className="mt-4 space-y-4 text-lg text-gray-700">
            <p>
              Your app should be live after vercel finishes deploying! If you
              see any error about a missing <code>app-id</code> it means we need
              to add it to the vercel environment. Run this command
            </p>
          </div>
          <div className="mt-6">
            <TerminalBlock
              commandTemplate="vercel env add NEXT_PUBLIC_INSTANT_APP_ID production"
              selectedPmIndex={selectedPmIndex}
            />
          </div>
          <p className="mt-4 pb-10 text-lg text-gray-700">
            and it will prompt you to paste your app id. You can find the value
            in your <code>.env</code> file. Redeploy and you should have a
            fully-working app.
          </p>
        </div>
      </div>

      {/* Closing / Share / Rating */}
      <div className="relative overflow-hidden bg-[#F0F5FA]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-48 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <AnimateIn>
              <SectionTitle>Huzzah!</SectionTitle>
              <SectionSubtitle>
                If you're curious, you can go to your{' '}
                <a
                  href="/dash"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  Instant dashboard
                </a>{' '}
                and see your data in the Explorer tab as you interact with your
                app. And tag us on{' '}
                <a
                  href="https://twitter.com/instant_db"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-orange-600 hover:text-orange-800"
                >
                  @instant_db
                </a>
                , we'd love to see what you built!
              </SectionSubtitle>
            </AnimateIn>

            <AnimateIn delay={100}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <LandingButton href="/dash">Go to Dashboard</LandingButton>
                <a
                  href="https://twitter.com/intent/tweet?text=%0A%0ABuilt%20with%20@instant_db%20%F0%9F%9A%80%20Tutorial:%20https://instantdb.com/labs/mcp-tutorial"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:text-lg"
                >
                  <XIcon className="h-4 w-4" />
                  Share on X
                </a>
              </div>
            </AnimateIn>

            <AnimateIn delay={300}>
              <div className="mt-12 text-lg">
                <RatingBox pageId="tutorial" />
              </div>
            </AnimateIn>
          </div>
        </Section>
      </div>

      <Footer />
    </div>
  );
}
