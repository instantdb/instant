import React, { useState } from 'react';
import Head from 'next/head';
import { TabGroup, TabList, TabPanels, TabPanel, Tab } from '@headlessui/react';
import {
  Section,
  MainNav,
  LandingFooter,
  LandingContainer,
  PageProgressBar,
  H2,
  H3,
} from '@/components/marketingUi';
import { Fence, Copyable, SubsectionHeading } from '@/components/ui';
import RatingBox from '@/components/docs/RatingBox';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import clsx from 'clsx';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import CopyToClipboard from 'react-copy-to-clipboard';
import { Callout } from '@/components/docs/Callout';

type ClientType = 'claude' | 'codex' | 'cursor' | 'other';

const overviewSteps = [
  'Login to Instant in the terminal',
  'Install the Instant MCP server',
  'Scaffold a starter Instant app',
  'Prompt an LLM to build us an app (This is the fun part!)',
];

const packageManagers = [
  { id: 'npx', name: 'npx', runner: 'npx' },
  { id: 'pnpx', name: 'pnpx', runner: 'pnpx' },
  { id: 'bunx', name: 'bunx', runner: 'bunx' },
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

const debuggingItems = [
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
          know via the feedback tool at the bottom of this page or via our
          Discord.
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
  {
    id: 'agent-loop',
    title: 'Agent is in a loop with the same error',
    content: (
      <p>
        Sometimes the agent gets stuck between updating schema, permissions, and
        fixing types. Right now Instant doesn't support deleting or renaming
        attributes via the MCP. Sometimes a simple fix is to just tell the agent
        to create a whole new app. This will ensure the agent can create an app
        with the latest schema and permissions in your code.
      </p>
    ),
  },
];

function CopyButton({ command, label }: { command: string; label?: string }) {
  const [showCopySuccess, setShowCopySuccess] = useState(false);

  return (
    <CopyToClipboard
      text={command}
      onCopy={() => {
        setShowCopySuccess(true);
        setTimeout(() => setShowCopySuccess(false), 2000);
      }}
    >
      <div className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 transition-colors">
        {showCopySuccess ? (
          <button className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 text-orange-600" />
            {label && <span>Copied!</span>}
          </button>
        ) : (
          <button className="flex items-center gap-2">
            <ClipboardDocumentIcon className="h-4 w-4" />
            {label && <span>{label}</span>}
          </button>
        )}
      </div>
    </CopyToClipboard>
  );
}

function PackageManagerSelector({
  commandTemplate,
}: {
  commandTemplate: string;
}) {
  const [selectedIndex, setSelectedIndex] = useLocalStorage<number>(
    'package-manager-index',
    0,
  );

  const currentCommand = `${packageManagers[selectedIndex].runner} ${commandTemplate}`;

  return (
    <div className="flex justify-center">
      <div className="w-full">
        <TabGroup selectedIndex={selectedIndex} onChange={setSelectedIndex}>
          <TabList className="flex space-x-1 rounded-t-xl bg-gray-200 p-1 mb-0">
            {packageManagers.map((pm) => (
              <Tab
                key={pm.id}
                className={({ selected }) =>
                  clsx(
                    'w-full rounded-lg py-2.5 text-sm font-medium transition-all',
                    'ring-white ring-opacity-60 ring-offset-2 ring-offset-gray-400 focus:outline-none focus:ring-2',
                    selected
                      ? 'bg-white shadow-md text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )
                }
              >
                {pm.name}
              </Tab>
            ))}
          </TabList>

          <div className="bg-white rounded-b-lg border border-gray-300 shadow-sm">
            <TabPanels>
              {packageManagers.map((pm) => (
                <TabPanel key={pm.id} className="focus:outline-none">
                  <div className="p-5 font-mono text-xs md:text-sm flex items-center justify-between">
                    <span className="text-gray-900">{currentCommand}</span>
                    <CopyButton command={currentCommand} />
                  </div>
                </TabPanel>
              ))}
            </TabPanels>
          </div>
        </TabGroup>
      </div>
    </div>
  );
}

function PromptExample({ title, content }: { title: string; content: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-4">
        <SubsectionHeading className="flex-1">{title}</SubsectionHeading>
        <CopyButton command={content} label="Copy Prompt" />
      </div>
      <div className="bg-gray-50 rounded-md p-4 font-mono text-sm text-gray-800 whitespace-pre-wrap border-l-4 border-l-gray-300">
        {content}
      </div>
    </div>
  );
}

function DebuggingAccordion() {
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
    <div className="space-y-2">
      {debuggingItems.map((item) => {
        const isOpen = openItems.has(item.id);
        return (
          <div
            key={item.id}
            className="border border-gray-200 rounded-lg bg-gray-50"
          >
            <button
              onClick={() => toggleItem(item.id)}
              className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-100 focus:outline-none focus:bg-gray-100 transition-colors"
            >
              <span className="font-medium text-gray-900">{item.title}</span>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
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
              </svg>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 text-gray-700 border-t border-gray-100">
                <div className="space-y-4">
                  {item.content}
                  {item.videoUrl && (
                    <div className="pt-2">
                      <a
                        href={item.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
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
            )}
          </div>
        );
      })}
    </div>
  );
}

function MCPSetupInstructions() {
  const [selectedClient, setSelectedClient] = useState<ClientType>('claude');

  return (
    <div className="mb-16">
      <div className="mb-6">
        <H3>2. Install the Instant MCP server</H3>
      </div>
      <p className="text-gray-700 mb-6">
        Below are instructions on how to add the remote Instant MCP server.
        Select your preferred tool and follow the instructions.
      </p>

      {/* Client Selector */}
      <TabGroup
        selectedIndex={Object.keys(clientConfigs).indexOf(selectedClient)}
        onChange={(index) =>
          setSelectedClient(Object.keys(clientConfigs)[index] as ClientType)
        }
      >
        <TabList className="flex space-x-1 rounded-xl bg-gray-100 p-1 mb-6">
          {Object.entries(clientConfigs).map(([key, config]) => (
            <Tab
              key={key}
              className={({ selected }) =>
                clsx(
                  'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                  'ring-white ring-opacity-60 ring-offset-2 ring-offset-gray-400 focus:outline-none focus:ring-2',
                  selected
                    ? 'bg-white shadow text-gray-900'
                    : 'text-gray-600 hover:bg-white/60 hover:text-gray-900',
                )
              }
            >
              {config.name}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          {Object.entries(clientConfigs).map(([key, config]) => (
            <TabPanel key={key} className="py-6 focus:outline-none">
              {config.setupContent}
            </TabPanel>
          ))}
        </TabPanels>
      </TabGroup>

      <Callout type="warning" title="Authentication Required">
        After adding the MCP server you'll need to go through an OAuth flow to
        access the tools. Be sure to go through the auth flow to enable the
        Instant MCP server in your client!
      </Callout>
    </div>
  );
}

function BuildAppSection() {
  return (
    <div className="mb-16">
      <div className="mb-6">
        <H3>4. Prompt the LLM to build us an app! (This is the fun part!)</H3>
      </div>
      <div className="text-gray-700 space-y-3 mb-6">
        <p>
          Woohoo! Now that we've got everything set up, we're ready to build an
          app! Fire up your editor (cursor, windsurf, zed, etc.) or your CLI
          tool (claude, gemini, etc) and type up a prompt. Hit enter and watch
          the magic happen!
        </p>
        <p>Here are some example prompts for inspiration</p>
      </div>
      <div className="space-y-6">
        {examplePrompts.map((prompt, index) => (
          <PromptExample
            key={index}
            title={prompt.title}
            content={prompt.content}
          />
        ))}
      </div>
    </div>
  );
}

function DebuggingSection() {
  return (
    <div className="mb-16">
      <div className="mb-6">
        <H3>Debugging Common Issues</H3>
      </div>
      <p className="text-gray-700 mb-6">
        Run into an issue? Here are solutions to common problems you might
        encounter:
      </p>
      <DebuggingAccordion />
    </div>
  );
}

function ClosingSection() {
  return (
    <p>
      Huzzah! You've built your first app with Instant! If you're curious, you
      can go to your{' '}
      <a href="/dash" className="text-blue-600 hover:text-blue-800 underline">
        Instant dashboard
      </a>{' '}
      and see all the data you've created in the Explorer tab.
    </p>
  );
}

function ShareCreationSection() {
  return (
    <div className="mb-16">
      <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">🎉</div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-gray-800 mb-2">
              Show off your creation!
            </h4>
            <p className="text-gray-600 mb-4">
              We'd love to see what you built! Tweet us{' '}
              <a
                href="https://twitter.com/instant_db"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:text-orange-800 font-medium"
              >
                @instant_db
              </a>{' '}
              and we'll amplify your awesome creations to the community.
            </p>
            <a
              href="https://twitter.com/intent/tweet?text=%0A%0ABuilt%20with%20@instant_db%20%F0%9F%9A%80%20Tutorial:%20https://instantdb.com/labs/mcp-tutorial"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-full text-sm font-medium transition-colors"
            >
              <span>🧡</span>
              <span>Share on Twitter</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const pageTitle =
  'Whirlwind tour: Build and deploy a full-stack app with InstantDB';

const cursorMCPConfig = `{
  "mcpServers": {
    "instant": {
      "url": "https://mcp.instantdb.com/mcp"
    }
  }
}`;

const clientConfigs = {
  claude: {
    name: 'Claude Code',
    setupContent: (
      <div className="space-y-4">
        <p>
          If you're on a paid plan, you can add the server via the command line:
        </p>
        <Copyable value="claude mcp add instant -s user -t http https://mcp.instantdb.com/mcp" />
        <p>Now you can run through the following:</p>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            Run <code>claude</code> in your terminal to start the Claude Code
            CLI.
          </li>
          <li>
            Run <code>/mcp</code> to see your list of MCP servers.
          </li>
          <li>
            See <code>instant</code> listed there!
          </li>
          <li>
            Select it and go through the auth flow to enable the Instant MCP
            server in your claude code sessions!
          </li>
        </ol>
      </div>
    ),
  },
  codex: {
    name: 'Codex',
    setupContent: (
      <div className="space-y-4">
        <p>
          If you're on a paid plan, you can add the server via the command line:
        </p>
        <Copyable value='codex mcp add instant -- npx -y mcp-remote "https://mcp.instantdb.com/mcp"' />
        <p>Now you can run through the following:</p>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            Run <code>codex</code> in your terminal to start Codex
          </li>
          <li>After a few seconds, codex should initiate an auth flow</li>
          <li>
            Complete the flow to enable the Instant MCP server in your codex
            sessions!
          </li>
        </ol>
      </div>
    ),
  },
  cursor: {
    name: 'Cursor',
    setupContent: (
      <div className="space-y-4">
        <p>Click this button to install the Instant MCP server in Cursor:</p>
        <div className="flex">
          <a
            href="https://cursor.com/install-mcp?name=InstantDB&config=eyJ1cmwiOiJodHRwczovL21jcC5pbnN0YW50ZGIuY29tL21jcCJ9"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              width={150}
              src="https://cursor.com/deeplink/mcp-install-dark.svg"
              alt="Install MCP Server"
              className="hover:opacity-80 transition-opacity"
            />
          </a>
        </div>
        <p>
          Alternatively you can paste this into your `~/.cursor/mcp.json`
          directly
        </p>
        <Fence code={cursorMCPConfig} copyable={true} language="json" />
        <p>
          You should now see the Instant MCP server in your MCP servers list. If
          you don't you may need to restart Cursor. Once you see it, click the
          "Needs Login" button to go through the auth flow.
        </p>
      </div>
    ),
  },
  other: {
    name: 'Other',
    setupContent: (
      <div className="space-y-4">
        <p>
          For other tools that support MCP servers, you can configure Instant
          using either our streamable HTTP endpoint (recommended if your tool
          supports it):
        </p>
        <Copyable value="https://mcp.instantdb.com/mcp" />
        <p>Or our SSE endpoint:</p>
        <Copyable value="https://mcp.instantdb.com/sse" />
      </div>
    ),
  },
};

export default function TutorialNew() {
  return (
    <LandingContainer>
      <Head>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content="Build full-stack apps with InstantDB in 5-10 minutes!"
        />
      </Head>

      <PageProgressBar />
      <MainNav />

      <Section>
        <div className="max-w-4xl mx-auto">
          <div className="mt-12 mb-8">
            <div className="mb-6">
              <H2>{pageTitle}</H2>
            </div>

            <div className="mb-12 text-lg text-gray-700 space-y-6">
              <p>👋 Hey there!</p>
              <p>
                In this tutorial we'll walk through creating a full-stack app
                with InstantDB. Within 5-10 minutes you'll have an app that runs
                on your computer, and if you like, can be deployed into the
                wild!
              </p>
            </div>
          </div>
          <div className="text-gray-700 space-y-12">
            <div>
              <H3>What we'll do:</H3>
              <ol className="mt-4 space-y-2 text-lg text-gray-700">
                {overviewSteps.map((step, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="font-mono text-gray-500">
                      {index + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* instant-cli login */}
            <div className="space-y-3">
              <H3>1. Log in to Instant via instant-cli</H3>
              <p>
                As a first step let's make sure you're logged in. Run the
                following command in the terminal with your favorite package
                manager.
              </p>
              <PackageManagerSelector commandTemplate="instant-cli login" />
              <p>
                This will open up a broswer window where you can log in to your
                Instant account or sign up if you don't have one yet.
              </p>
            </div>

            <MCPSetupInstructions />

            {/* create-instant-app */}
            <div className="space-y-3">
              <H3>3. Scaffold a starter instant app</H3>

              <p>
                Now that you're authenticated any app you make will persist
                unless you delete the data later — woohoo!
              </p>

              <p>
                As a next step we'll use <b>create-instant-app</b>, our CLI
                tool, which makes it super easy to get started with a new
                Instant project. Run the following in your terminal.
              </p>

              <PackageManagerSelector commandTemplate="create-instant-app" />

              <p>
                Go through the prompts to select your framework and llm. Once
                the app is generated change into the new directory and go on to
                step 3!
              </p>
            </div>
            <BuildAppSection />
            <DebuggingSection />
            <ClosingSection />
            <ShareCreationSection />
            <RatingBox pageId="llm-tutorial" />
          </div>
        </div>
      </Section>
      <div className="h-6" />
      <LandingFooter />
    </LandingContainer>
  );
}
