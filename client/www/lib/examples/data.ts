export interface AppMetadata {
  slug: string;
  title: string;
  linesOfCode: string;
  tags: string[];
  description: string;
  shortDescription: string;
  screenshot: string;
  githubUrl: string;
  youtubeVideoId?: string;
}

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
database. This can be super useful for testing and development!
`.trim();

const chatDescription = `
A chat app showing who's online with support for mulitple channels.

In this app we demonstrate how to use guest authentication to allow users to join
without fully signing-up. Signed in users show up in the online list and can
send messages to the chat.

Different channels are supported and presences and messages are scoped to each channel.
`.trim();

export const appMetas: AppMetadata[] = [
  {
    slug: 'todos',
    title: 'Todo App',
    linesOfCode: `~100`,
    tags: [
      'Basic schema',
      'Basic Queries',
      'Basic Transactions',
      'Basic Presence',
    ],
    description: todoDescription,
    shortDescription: 'See the basics of InstantDB in action',
    screenshot: '/img/showcase/todos_preview.png',
    githubUrl: 'https://github.com/instantdb/instant-examples/tree/main/todos',
    youtubeVideoId: '827EPRQ0ww0',
  },
  {
    slug: 'microblog',
    title: 'Microblog',
    linesOfCode: `~400`,
    tags: ['Auth', 'Profiles', 'Schema Links', 'Seed Data'],
    description: blogDescription,
    shortDescription:
      'Learn how to model relationships and use authentication with InstantDB',
    screenshot: '/img/showcase/blog_preview.png',
    githubUrl:
      'https://github.com/instantdb/instant-examples/tree/main/microblog',
  },
  {
    slug: 'chat',
    title: 'Chat',
    linesOfCode: '~300',
    tags: ['Guest Auth', 'Presence', 'Seed Data'],
    shortDescription: 'Build a real-time chat app with presence',
    description: chatDescription,
    screenshot: 'img/showcase/chat_preview.png',
    githubUrl: 'https://github.com/instantdb/instant-examples/tree/main/chat',
  },
];
