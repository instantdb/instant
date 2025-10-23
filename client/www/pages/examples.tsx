import Head from 'next/head';
import { Button } from '@/components/ui';
import {
  LandingFooter,
  LandingContainer,
  MainNav,
  Section,
  H2,
  H3,
} from '@/components/marketingUi';

const todoDescription = `
A simple todo app that allows you to create, read, update, and delete
todo items. Additionally, it tracks and displays the number of active viewers
currently looking at the todo list.

As a fun bonus, everything is real-time and works offline! You don't need to
write any special code to get these features; they are built-in with Instant.
`.trim();

const blogDescription = `
A microblog app that allows users to create and like posts.

By default anyone can view posts, but only authenticated users can create posts and like
them. User profiles with unique usernames are also supported.

We also demonstrate how to use the Admin SDK to both bootstrap and reset the
database. jhis can be super useful for testing and development!
`.trim();

const chatDescription = `
A chat app showing who's online with support for mulitple channels.

In this app we demonstrate how to use guest authentication to allow users to join
without fully signing-up. Signed in users show up in the online list and can
send messages to the chat.

Different channels are supported and presences and messages are scoped to each channel.
`.trim();

interface App {
  id: string;
  title: string;
  linesOfCode: string;
  tags: string[];
  description: string;
  screenshot: string;
  githubUrl: string;
  youtubeUrl: string;
}

const apps: App[] = [
  {
    id: 'todo-app',
    title: 'Todo App',
    linesOfCode: `~100`,
    tags: [
      'Basic schema',
      'Basic Queries',
      'Basic Transactions',
      'Basic Presence',
    ],
    description: todoDescription,
    screenshot: '/img/showcase/todos_preview.png',
    githubUrl: 'https://github.com/nezaj/instant-todo-video-tutorial',
    youtubeUrl: 'https://www.youtube.com/watch?v=827EPRQ0ww0',
  },
  {
    id: 'blog-app',
    title: 'Microblog',
    linesOfCode: `~400`,
    tags: ['Auth', 'Profiles', 'Schema Links', 'Seed Data'],
    description: blogDescription,
    screenshot: '/img/showcase/blog_preview.png',
    githubUrl: 'https://github.com/nezaj/instant-todo-video-tutorial',
    youtubeUrl: 'https://www.youtube.com/watch?v=827EPRQ0ww0',
  },
  {
    id: 'chat-app',
    title: 'Chat',
    linesOfCode: '~300',
    tags: ['Guest Auth', 'Presence', 'Seed Data'],
    description: chatDescription,
    screenshot: 'img/showcase/chat_preview.png',
    githubUrl: 'https://github.com/nezaj/instant-todo-video-tutorial',
    youtubeUrl: 'https://www.youtube.com/watch?v=827EPRQ0ww0',
  },
];

function LeftColumn({ app }: { app: App }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <H3>{app.title}</H3>
        <p className="text-sm text-gray-600 mt-1">
          {app.linesOfCode} lines of code
        </p>
      </div>

      {/* Tags */}
      <div>
        <div className="flex flex-wrap gap-2">
          {app.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block bg-gray-200 px-3 py-1 rounded-md text-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Description -- hidden on mobile */}
      <div className="text-base leading-relaxed text-gray-800 hidden md:block space-y-2">
        {app.description.split('\n\n').map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function RightColumn({ app }: { app: App }) {
  return (
    <div className="space-y-6">
      {/* Screenshot */}
      <img
        src={app.screenshot}
        alt={app.title}
        className="w-full object-cover rounded-lg border border-gray-600"
      />

      {/* Buttons */}
      <div className="flex gap-4">
        <Button
          type="link"
          href={app.youtubeUrl}
          className="flex-1"
          variant="cta"
        >
          Watch Tutorial
        </Button>
        <Button
          type="link"
          href={app.githubUrl}
          className="flex-1"
          variant="secondary"
        >
          See Code
        </Button>
      </div>
    </div>
  );
}

function Showcase() {
  return (
    <div className="space-y-12">
      <div className="mt-12 space-y-8">
        <H2>Example Apps built w/ Instant</H2>
        <p className="mb-12 text-lg text-gray-700 space-y-6">
          Curious to see Instant in action? Here are some common apps to give
          you a sense on how to build with Instant. Each app includes links to
          the source code and video walkthroughs explaining the code.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12">
        {apps.map((app) => (
          <div
            key={app.id}
            className="grid grid-cols-1 md:grid-cols-2 col-span-1 md:col-span-2 gap-8"
          >
            <LeftColumn app={app} />
            <RightColumn app={app} />

            {/* Mobile-only Description */}
            <div className="text-base leading-relaxed text-gray-800 md:hidden space-y-2">
              {app.description.split('\n\n').map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const pageTitle = 'InstantDB Showcase';

export default function Page() {
  return (
    <LandingContainer>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Learn Instant through example apps" />
      </Head>
      <MainNav />
      <Section>
        <Showcase />
      </Section>
      <div className="h-12" />
      <LandingFooter />
    </LandingContainer>
  );
}
