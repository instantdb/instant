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
  platform: 'web' | 'mobile';
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

const mobileChatDescription = `
A real-time chat app built with React Native and InstantDB.

In this tutorial, Beto walks through how to set up InstantDB in a React Native project, define a schema, write queries and transactions, and build a fully functional chat experience with instant syncing across devices.
`.trim();

const appBuilderDescription = `
A self-building app powered by React Native and InstantDB.

In this tutorial, Simon builds on core InstantDB concepts and shows how to use Storage for uploading assets and the Platform API for programmatically spinning up databases.
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
    platform: 'web',
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
    platform: 'web',
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
    platform: 'web',
  },
  {
    slug: 'mobile-chat',
    title: 'Real-time Chat',
    linesOfCode: '~400',
    tags: ['React Native', 'Schema', 'Queries', 'Transactions'],
    description: mobileChatDescription,
    shortDescription:
      'Build a real-time chat app with React Native and InstantDB',
    screenshot: '/img/showcase/mobile_chat_preview.jpg',
    githubUrl: 'https://github.com/betomoedano/instant-realtime-chat',
    youtubeVideoId: 'jyVR5NDjNJ4',
    platform: 'mobile',
  },
  {
    slug: 'app-builder',
    title: 'App Builder',
    linesOfCode: '~500',
    tags: ['React Native', 'Storage', 'Platform API'],
    description: appBuilderDescription,
    shortDescription:
      'Build a self-building app with React Native and InstantDB',
    screenshot: '/img/showcase/app_builder_preview.jpg',
    githubUrl: 'https://github.com/Galaxies-dev/app-builder',
    youtubeVideoId: 'HRACNTmikZI',
    platform: 'mobile',
  },
];

export const webMetas = appMetas.filter((a) => a.platform === 'web');
export const mobileMetas = appMetas.filter((a) => a.platform === 'mobile');
