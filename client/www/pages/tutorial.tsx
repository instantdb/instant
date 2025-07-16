import { useState } from 'react';
import Head from 'next/head';
import { Tab } from '@headlessui/react';
import { Fence, Copyable, SubsectionHeading } from '@/components/ui';
import { Callout } from '@/components/docs/Callout';
import RatingBox from '@/components/docs/RatingBox';
import {
  Section,
  MainNav,
  LandingFooter,
  LandingContainer,
  PageProgressBar,
  H2,
  H3,
} from '@/components/marketingUi';
import clsx from 'clsx';
import {
  ClipboardDocumentIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/solid';
import copy from 'copy-to-clipboard';
import fs from 'fs';
import path from 'path';

function getFiles(): Record<string, string> {
  const markdownDir = path.join(process.cwd(), 'public', 'mcp-tutorial');
  return fs
    .readdirSync(markdownDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .reduce(
      (acc, fileName) => {
        const name = fileName.replace(/\.md$/, '');
        const content = fs.readFileSync(
          path.join(markdownDir, fileName),
          'utf8',
        );
        acc[name] = content;
        return acc;
      },
      {} as Record<string, string>,
    );
}

type MarkdownContent = {
  files: Record<string, string>;
};

type ClientType = 'cursor' | 'claude-code' | 'windsurf' | 'zed' | 'other';

const pageTitle =
  'Whirlwind tour: Build and deploy a full-stack app with InstantDB';

const cursorMCPConfig = `{
  "mcpServers": {
    "instant": {
      "url": "https://mcp.instantdb.com/mcp"
    }
  }
}`;

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

const vercelAddEnv =
  'npx vercel env add NEXT_PUBLIC_INSTANT_APP_ID production < .env.local';

export async function getStaticProps() {
  const files = getFiles();

  return {
    props: {
      files,
    },
  };
}

function CopyButton({
  text,
  label = 'Copy',
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
    >
      {copied ? (
        <CheckCircleIcon className="h-4 w-4 text-green-500" />
      ) : (
        <ClipboardDocumentIcon className="h-4 w-4" />
      )}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function FileContentCard({
  title,
  content,
  filename,
  description,
}: {
  title: string;
  content: string;
  filename?: string;
  description: string;
}) {
  return (
    <div className="max-w-sm border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div>
        <h4 className="font-medium text-gray-900 mb-1">{title}</h4>
        {filename && (
          <p className="text-xs text-gray-600 font-mono mb-2">{filename}</p>
        )}
        <p className="text-sm text-gray-600 mb-3">{description}</p>
        <CopyButton text={content} />
      </div>
    </div>
  );
}

function PromptExample({ title, content }: { title: string; content: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-4">
        <SubsectionHeading className="flex-1">{title}</SubsectionHeading>
        <CopyButton text={content} label="Copy Prompt" />
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

  const debuggingItems = [
    {
      id: 'general-troubleshooting',
      title: 'General troubleshooting',
      content: (
        <div className="space-y-3">
          <p>
            If you encounter an error we should hopefully bubble up a message to
            you that you can just copy and paste to your agent to fix. Sometimes
            though you may see a blank screen or an unhelpful error like{' '}
            <code>[Object object]</code>. We're working on squashing all those
            cases!
          </p>
          <p>
            In the mean time you can open your browser's devtools and look at
            the output in the console. There should be an error logged that you
            can expand and paste into your agent. Below are some more common
            errors we're aware of.
          </p>
          <p>
            If you encounter an issue not listed below please feel free to let
            us know via the feedback tool at the bottom of this page or via our
            Discord.
          </p>
        </div>
      ),
    },
    {
      id: 'malformed-parameter',
      title: 'Error: Malformed parameter: ["body" "app-id"]',
      videoUrl: 'https://youtu.be/qV3LPt9fS0w',
      content: (
        <div className="space-y-3">
          <p>
            If you see this it means the agent likely forgot to actually create
            the app or update the code with the app id. You should be able to
            copy paste the error message to your agent and nudge it to actually
            create the app for you with the Instant MCP.
          </p>
          <p>
            You may also see this error only when you're looking at the deployed
            app from vercel. In that case the fix is to add the environment
            variables to vercel:
          </p>
          <Copyable value={vercelAddEnv} />
        </div>
      ),
    },
    {
      id: 'validation-query',
      title: 'Validation failed for query',
      videoUrl: 'https://youtu.be/8K1Uk98od_c',
      content: (
        <p>
          If you see this you'll likely see a few sentences describing the
          error. You should be able to copy and paste the error message to your
          agent and it will figure it out.
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
          <code>transact</code>. To resolve this open up your browser's dev
          tools and copy/paste the error into your agent. Tell it you think the
          problem is related to not using <code>id()</code> in transact. This
          should do the trick!
        </p>
      ),
    },
    {
      id: 'permission-denied',
      title: 'Permission denied: not perms-pass?',
      videoUrl: 'https://youtu.be/tCYKYRaxk-g',
      content: (
        <p>
          This can happen if an invalid or unexpected permission rule was
          pushed. The behavior will look similar to validation failure where{' '}
          <code>transact</code> fails and rolls-back a change. To resolve this
          open up your browser's dev tools and copy/paste the error into your
          agent. Tell it the problem is related to permissions and have it push
          up a fix.
        </p>
      ),
    },
    {
      id: 'missing-attributes',
      title: 'Missing required attributes',
      videoUrl: 'https://youtu.be/jGvSFMhxr74',
      content: (
        <p>
          You may encounter this when you are trying to add or delete data.
          What's likely happening is some entity has a required link. To resolve
          this open up your browser's dev tools and copy/paste the error into
          your agent. Tell it you think the problem is related to required
          attributes and the fix is to update schema with an onDelete cascade.
          This should do the trick!
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
            running dev server. Simply restart your dev server to continue
            along.
          </p>
        </div>
      ),
    },
    {
      id: 'agent-loop',
      title: 'Agent is in a loop with the same error',
      content: (
        <p>
          Sometimes the agent gets stuck between updating schema, permissions,
          and fixing types. Right now Instant doesn't support deleting or
          renaming attributes via the MCP. Sometimes a simple fix is to just
          tell the agent to create a whole new app. This will ensure the agent
          can create an app with the latest schema and permissions in your code.
        </p>
      ),
    },
  ];

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

export default function McpTutorial({ files }: MarkdownContent) {
  const [selectedClient, setSelectedClient] = useState<ClientType>('cursor');

  const {
    'cursor-rules': cursorRulesContent,
    claude: claudeMdContent,
    'claude-rules': claudeRulesContent,
    'windsurf-rules': windsurfRulesContent,
    'other-rules': otherRulesContent,
  } = files;

  const clientConfigs = {
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
            You should now see the Instant MCP server in your MCP servers list.
            If you don't you may need to restart Cursor. Once you see it, click
            the "Needs Login" button to go through the auth flow.
          </p>
        </div>
      ),
      rulesContent: (
        <div className="space-y-6">
          <FileContentCard
            title="Instant Rules for Cursor"
            content={cursorRulesContent}
            filename=".cursor/rules/instant.md"
            description="Click the button below to copy the rules for Instant and paste them into .cursor/rules/instant.md in the root of your project."
          />
        </div>
      ),
    },
    'claude-code': {
      name: 'Claude Code',
      setupContent: (
        <div className="space-y-4">
          <p>
            If you're on a paid plan, you can add the server via the command
            line:
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
      rulesContent: (
        <div className="flex gap-6 flex-wrap">
          <FileContentCard
            title="CLAUDE.md"
            content={claudeMdContent}
            filename="CLAUDE.md"
            description="Click the button below to copy instructions for Claude to use Instant rules. Paste these into a file named CLAUDE.md in the root of your project."
          />
          <FileContentCard
            title="Instant Rules for Claude Code"
            content={claudeRulesContent}
            filename="instant-rules.md"
            description="Click the button below to copy the rules for Instant and paste them into instant-rules.md in the same directory as your CLAUDE.md"
          />
        </div>
      ),
    },
    windsurf: {
      name: 'Windsurf',
      setupContent: (
        <div className="space-y-4">
          <p>You can add the MCP server through the Windsurf UI:</p>
          <ol className="list-decimal list-inside space-y-2 mb-4">
            <li>Open Windsurf Settings.</li>
            <li>Under Cascade, you'll find Model Context Protocol Servers.</li>
            <li>
              Select Add Server and paste the relevant snippet for your OS.
            </li>
          </ol>
          <p>
            Alternatively you can directly edit your{' '}
            <code>`~/.codeium/windsurf/mcp_config.json`</code>
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">MacOS/Linux</h4>
              <Fence
                code={`{
  "mcpServers": {
    "instant": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.instantdb.com/sse"]
    }
  }
}`}
                copyable={true}
                language="json"
              />
            </div>
            <div>
              <h4 className="font-medium mb-2">Windows</h4>
              <Fence
                code={`{
  "mcpServers": {
    "instant": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mcp-remote", "https://mcp.instantdb.com/sse"]
    }
  }
}`}
                copyable={true}
                language="json"
              />
            </div>
            <div>
              <h4 className="font-medium mb-2">Windows WSL</h4>
              <Fence
                code={`{
  "mcpServers": {
    "instant": {
      "command": "wsl",
      "args": ["npx", "-y", "mcp-remote", "https://mcp.instantdb.com/sse"]
    }
  }
}`}
                copyable={true}
                language="json"
              />
            </div>
          </div>
        </div>
      ),
      rulesContent: (
        <div className="flex gap-6 flex-wrap">
          <FileContentCard
            title="Instant Rules for Windsurf"
            content={windsurfRulesContent}
            filename=".windsurf/rules/instant.md"
            description="Click the button below to copy the rules for Instant and paste them into .windsurf/rules/instant.md in the root of your project."
          />
        </div>
      ),
    },
    zed: {
      name: 'Zed',
      setupContent: (
        <div className="space-y-4">
          <p>Open your Zed settings and add the following:</p>
          <Fence
            code={`{
  "context_servers": {
    "instant": {
      "command": {
        "path": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.instantdb.com/sse"],
        "env": {}
      },
      "settings": {}
    }
  }
}`}
            copyable={true}
            language="json"
          />
        </div>
      ),
      rulesContent: (
        <div className="space-y-6">
          <FileContentCard
            title="Instant Rules for Zed"
            content={otherRulesContent}
            filename="AGENT.md"
            description="Click the button below to copy the rules for Instant and paste them into AGENT.md in the root of your project."
          />
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
      rulesContent: (
        <div className="space-y-6">
          <FileContentCard
            title="Instant Rules for Other Tools"
            content={otherRulesContent}
            description="Click the button below to copy the rules for Instant. You can add these to your LLM tool's context or rules file."
          />
        </div>
      ),
    },
  };

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
          {/* Hero Section */}
          <div className="mt-12 mb-8">
            <div className="mb-6">
              <H2>{pageTitle}</H2>
            </div>
            <p className="text-lg text-gray-700 mb-8">
              👋 Hey there!
              <br />
              <br />
              In this tutorial we'll build a full-stack app with InstantDB.
              Within 5-10 minutes you'll have an app that you can run locally
              and deploy!
            </p>

            <div>
              <div className="mb-6">
                <H3>What we'll do:</H3>
              </div>
              <ol className="space-y-3 text-lg text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="font-mono text-gray-500">1.</span>
                  <span>Install the Instant MCP server</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-gray-500">2.</span>
                  <span>Scaffold a starter app with Next.js</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-gray-500">3.</span>
                  <span>Add some rules for our LLMs to understand Instant</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-gray-500">4.</span>
                  <span>
                    Prompt the LLM to build us an app! (This is the fun part!)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-gray-500">5.</span>
                  <span>Deploy the app to Vercel</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Step 1: Install MCP Server */}
          <div className="mb-16">
            <div className="mb-6">
              <H3>1. Install the Instant MCP server</H3>
            </div>
            <p className="text-gray-700 mb-6">
              Below are instructions on how to add the remote Instant MCP
              server. Select your preferred tool and follow the instructions.
            </p>

            {/* Client Selector */}
            <Tab.Group
              selectedIndex={Object.keys(clientConfigs).indexOf(selectedClient)}
              onChange={(index) =>
                setSelectedClient(
                  Object.keys(clientConfigs)[index] as ClientType,
                )
              }
            >
              <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1 mb-6">
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
              </Tab.List>
              <Tab.Panels>
                {Object.entries(clientConfigs).map(([key, config]) => (
                  <Tab.Panel key={key} className="py-6 focus:outline-none">
                    {config.setupContent}
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </Tab.Group>

            <Callout type="warning" title="Authentication Required">
              After adding the MCP server you'll need to go through an OAuth
              flow to access the tools. Be sure to go through the auth flow to
              enable the Instant MCP server in your client!
            </Callout>
          </div>

          {/* Step 2: Scaffold App */}
          <div className="mb-16">
            <div className="mb-6">
              <H3>2. Scaffold a starter app with Next.js</H3>
            </div>
            <p className="text-gray-700 mb-6">
              With the Instant MCP server installed, we can now scaffold a
              starter app. Run the following commands in your terminal:
            </p>

            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                First, create a new Next.js app:
              </p>
              <Copyable value="npx create-next-app@latest vibes --yes" />
            </div>

            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                Then, navigate to the project:
              </p>
              <Copyable value="cd vibes" />
            </div>

            <div>
              <p className="text-gray-700 mb-3">
                Finally, add Instant's React SDK:
              </p>
              <Copyable value="npm i @instantdb/react" />
            </div>
          </div>

          {/* Step 3: Add Rules */}
          <div className="mb-16">
            <div className="mb-6">
              <H3>3. Add some rules for our LLMs to understand Instant</H3>
            </div>
            <p className="text-gray-700 mb-6">
              Now that we have a Next.js app scaffolded, we need to add some
              rules for our LLMs to understand how to interact with InstantDB.
              Select your client below to get the context set up.
            </p>

            {/* Rules for selected client */}
            <Tab.Group
              selectedIndex={Object.keys(clientConfigs).indexOf(selectedClient)}
              onChange={(index) =>
                setSelectedClient(
                  Object.keys(clientConfigs)[index] as ClientType,
                )
              }
            >
              <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1 mb-6">
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
              </Tab.List>
              <Tab.Panels>
                {Object.entries(clientConfigs).map(([key, config]) => (
                  <Tab.Panel key={key} className="py-6 focus:outline-none">
                    {config.rulesContent}
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </Tab.Group>

            <Callout type="note" title="Verify Setup">
              <p>
                You can verify you set up the rules correctly by asking your LLM
                "How do you make queries and transactions in InstantDB?" If
                everything is set up correctly, you should see a response with
                information about <code>db.useQuery</code> and{' '}
                <code>transact</code>.
              </p>
              <p>
                If you see a response that doesn't mention these methods, double
                check that you added the rules correctly and try restarting your
                tool.
              </p>
            </Callout>
          </div>

          {/* Step 4: Build the App */}
          <div className="mb-16">
            <div className="mb-6">
              <H3>
                4. Prompt the LLM to build us an app! (This is the fun part!)
              </H3>
            </div>
            <div className="text-gray-700 space-y-3 mb-6">
              <p>
                Woohoo! Now that we've got everything set up, we're ready to
                build an app! Fire up your editor (cursor, windsurf, zed, etc.)
                or your CLI tool (claude, gemini, etc) and type up a prompt. Hit
                enter and watch the magic happen!
              </p>
              <p>
                <strong>
                  We've seen the best results with Claude Sonnet 4 and Claude
                  Opus.
                </strong>{' '}
                Be sure to select either of those instead of an "auto" model if
                you can.
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

          {/* Debugging Section */}
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

          {/* Step 5: Deploy */}
          <div className="mb-16">
            <div className="mb-6">
              <H3>5. Deploy the app to Vercel</H3>
            </div>
            <p className="text-gray-700 mb-6">
              Once you've got a working app we can get it live by deploying to
              Vercel! Before we deploy, let's verify there are no build errors.
              In the terminal run:
            </p>
            <div className="mb-6">
              <p className="text-gray-700 mb-3"></p>
              <Copyable value="npm run build" />
            </div>

            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                If there are any build errors paste them into your agent to get
                them fixed up. Make sure your app still works as expected after
                your agent gets the build to pass:
              </p>
              <Copyable value="npm run dev" />
            </div>

            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                If all looks well let's kick off a deploy!
              </p>
              <Copyable value="npx vercel --prod" />
            </div>

            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                After vercel finishes the deploy check out your live app. If you
                see any an error about a missing <code>app-id</code> it means
                we'll need to add it to the vercel environment:
              </p>
              <Copyable value={vercelAddEnv} />
            </div>

            <p className="text-gray-700 mt-6">
              Once the deploy finishes you should have a fully-working app.
              Huzzah! If you're curious, you can go to your{' '}
              <a
                href="/dash"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Instant dashboard
              </a>{' '}
              and see all the data you've created in the Explorer tab.
            </p>
          </div>

          {/* Share Your Creation */}
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

          {/* Feedback Section */}
          <div className="mb-16">
            <RatingBox pageId="mcp-tutorial" />
          </div>
        </div>
      </Section>
      <LandingFooter />
    </LandingContainer>
  );
}
