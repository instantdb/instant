![](/img/showcase/blog_preview.png 'A whimsical take on Twitter')

# Quickstart

Clone the repo and install dependencies:

```bash
# Clone repo
git clone https://github.com/instantdb/instant-examples

# Navigate into the microblog example
cd instant-examples/microblog

# Install dependencies
pnpm i
```

If you haven't already, be sure to log into the Instant CLI

```bash
pnpx instant-cli login
```

Now let's initialize a new app with the Instant CLI.

```bash
pnpx instant-cli init
```

We've provided a schema in `instant.schema.ts` that you can push to your app.
You may have already pushed this during `init` in the previous step. If you
answered 'no' to the prompt during init, or if you're unsure whether you pushed
the schema, you can push it now.

```bash
pnpx instant-cli push
```

Run the seed script to populate the database with some initial data:

```bash
pnpm run seed
```

Finally, run the development server:

```bash
pnpm run dev
```

# Walkthrough

We've written a brief companion guide that walks through the code in this app.
Use this as a reference as you explore the codebase!

1. [Schema](#schema)
1. [Queries](#queries)
1. [Transactions](#transactions)
1. [Bootstrap the database](#bootstrap-the-database)
1. [Integrating Auth](#integrating-auth)
1. [Adding profiles](#adding-profiles)
1. [Fin](#fin)

## Schema

In our earlier [todo app example](/examples/todos) we had a simple schema with just todos. In this
app we'll use users, profiles, posts, likes and demonstrate how to set up links
between entities.

These are the relevant entities for our app:

<file label="instant.schema.ts"></file>

```tsx
entities: {
  // ...
  $users: i.entity({
    email: i.string().unique().indexed().optional(),
    imageURL: i.string().optional(),
    type: i.string().optional(),
  }),
  profiles: i.entity({
    displayName: i.string(),
    handle: i.string().unique().indexed(), // unique username
  }),
  posts: i.entity({
    color: i.string(),
    content: i.string(),
    timestamp: i.number(),
  }),
  likes: i.entity({
    userId: i.string().indexed(),
    postId: i.string().indexed(),
  })
}
```

And these are the relevant links:

<file label="instant.schema.ts"></file>

```tsx
links: {
  userProfiles: {
    forward: {
      on: "profiles",
      has: "one",
      label: "user",
      onDelete: "cascade",
    },
    reverse: {
      on: "$users",
      has: "one",
      label: "profile",
    }
  },
  userLikes: {
    forward: {
      on: "likes",
      has: "one",
      label: "user",
      onDelete: "cascade",
    },
    reverse: {
      on: "profiles",
      has: "many",
      label: "likes",
    },
  },
  postAuthors: {
    forward: {
      on: "posts",
      has: "one",
      label: "author",
      onDelete: "cascade",
    },
    reverse: {
      on: "profiles",
      has: "many",
      label: "posts",
    },
  },
  postLikes: {
    forward: {
      on: "likes",
      has: "one",
      label: "post",
      onDelete: "cascade",
    },
    reverse: {
      on: "posts",
      has: "many",
      label: "likes",
    },
  },
}
```

This schema defines the following relationships:

- A $user has one profile, and a profile belongs to one $user.
- A profile has many posts, and a post belongs to one author (profile).
- A profile has many likes, and a like belongs to one user (profile).
- A post has many likes, and a like belongs to one post.

We also define [`cascade` delete](/docs/modeling-data#cascade-delete) behavior for our links between users and their
profiles, and then between profiles and posts/likes. This means that when a user
is deleted, their profile, posts, and likes will also be automatically deleted.

You may wonder **why** we have a separate `profiles` entity instead of just
adding profile fields directly to the `$users` entity. This is a common pattern
that allows us to separate sensitive user data (like email) from public profile
data (like display name and handle). You can learn more about this in our
[managing users docs](/docs/users#querying-users).

## Queries

With our schema set up, we can now query posts along with their authors and likes.

<file label="src/app/page.tsx"></file>

```tsx
type Post = InstaQLEntity<AppSchema, 'posts', { author: {}; likes: {} }>;

const { isLoading, error, data } = db.useQuery({
  posts: {
    // `serverCreatedAt` is a built-in field available for ordering
    $: { order: { serverCreatedAt: 'desc' } },
    author: {},
    likes: {},
  },
});
```

Each post will be in the shape of the `Post` type defined above like so:

```tsx
type Post = {
  id: string;
  color: string;
  content: string;
  timestamp: number;
  author:
    | {
        id: string;
        displayName: string;
        handle: string;
      }
    | undefined;
  likes: {
    id: string;
    postId: string;
    userId: string;
  }[];
};
```

This is where Instant's query languge really shines. Writing the equivalent SQL
would be much more complex, involving multiple `JOIN` statements to fetch the
author and likes for each post.

```sql
SELECT p.*, pp.author, pl.likes
FROM posts p
JOIN (
    SELECT p.id,
           json_build_object(
               'id', pr.id,
               'displayName', pr.display_name,
               'handle', pr.handle
           ) as author
    FROM posts p
    LEFT JOIN profiles pr on p.author_id = pr.id
    GROUP BY 1
) pp on p.id = pp.id
JOIN (
    SELECT p.id, json_agg(l.*) as likes
    FROM posts p
    LEFT JOIN likes l on p.id = l.post_id
    GROUP BY 1
) pl on p.id = pl.id
ORDER BY p.server_created_at DESC;
```

Yikes, right? However when building UIs we often need to fetch related data in a
tree-like structure, and that's exactly what Instant's query language is
designed for. Check out our docs on [fetching
associations](/docs/instaql#fetch-associations) to learn more.

## Transactions

Similar to our earlier todo app, we can create and delete posts and likes using
`db.transact` along with our `db.tx` operations. What's new here is the usage of
the `link` method to associate entities together.

<file label="src/app/page.tsx"></file>

```tsx
// We use `link` to associate the post with its author
function createPost(content: string, color: string, authorProfileId: string) {
  db.transact(
    db.tx.posts[id()]
      .create({
        content: content.trim(),
        timestamp: Date.now(),
        color,
      })
      .link({ author: authorProfileId }),
  );
}

// Deleting a post will also clean up the link to its author automatically
// Additionally, any likes associated with the post will also be deleted
// because of the `cascade` delete behavior we set up in the schema
function deletePost(postId: string) {
  db.transact(db.tx.posts[postId].delete());
}

// `link` can be used to create multiple associations at once
function createLike(userId: string, postId: string) {
  db.transact(
    db.tx.likes[id()]
      .create({ userId, postId })
      .link({ post: postId, user: userId }),
  );
}

// Deleting a like will also clean up the links to its user and post
// However, the user and post themselves will remain intact since we did not
// set up cascade delete behavior for those relationships (which is what we
// want, since deleting a like should not delete the user or post)
function deleteLike(likeId: string) {
  db.transact(db.tx.likes[likeId].delete());
}
```

Check out our docs on [linking](/docs/instaml#link-data) and
[unlinking](/docs/instaml#unlink-data) to learn more about how to work with
links in Instant.

## Bootstrap the database

One common pattern for apps is to have some initial data in the database. This
can be useful for development, testing, or even showing demo content to users.

Aside from using Instant on the client, you can use it on the backend or in
scripts by connecting to the database using the Admin SDK.

<file label="src/lib/adminDb.ts"></file>

```tsx
import { init } from '@instantdb/admin';
import schema from '@/instant.schema';
import dotenv from 'dotenv';
dotenv.config();

// adminToken is required for admin SDK connections
// Be sure to keep this token secret and never use the adminDB on the client
// since it allows full access to your database
export const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});
```

We can now use this `adminDb` to bootstrap our database with some initial data.

<file label="scripts/seed.ts"></file>

```tsx
interface Post {
  id: number;
  author: string;
  handle: string;
  color: string;
  content: string;
  timestamp: string;
  likes: number;
  liked: boolean;
}

const mockPosts: Post[] = [
  {
    id: 1,
    author: 'Sarah Chen',
    handle: 'sarahchen',
    color: 'bg-blue-100',
    content:
      'Just launched my new project! Really excited to share it with everyone.',
    timestamp: '2h ago',
    likes: 12,
    liked: false,
  },
  {
    id: 2,
    author: 'Alex Rivera',
    handle: 'alexrivera',
    color: 'bg-purple-100',
    content: 'Beautiful sunset today. Nature never stops amazing me.',
    timestamp: '4h ago',
    likes: 19,
    liked: true,
  },
  {
    id: 3,
    author: 'Jordan Lee',
    handle: 'jordanlee',
    color: 'bg-pink-100',
    content:
      'Working on something cool with Next.js and TypeScript. Updates coming soon!',
    timestamp: '6h ago',
    likes: 7,
    liked: false,
  },
];

function friendlyTimeToTimestamp(friendlyTime: string) {
  const hours = parseInt(friendlyTime);
  const now = Date.now();
  return now - hours * 60 * 60 * 1000;
}

function seed() {
  console.log('Seeding db...');
  mockPosts.forEach((post) => {
    // generate unique IDs for user and post
    const userId = id();
    const postId = id();

    // Create user and a profile linked to the user
    // Notice how we use the same userId for both the user and profile
    // This will be useful later when we want to restrict deleting posts/likes
    // to the owner of the profile
    const user = adminDb.tx.$users[userId].create({});
    const profile = adminDb.tx.profiles[userId]
      .create({
        displayName: post.author,
        handle: post.handle,
      })
      .link({ user: userId });

    const postEntity = adminDb.tx.posts[postId]
      .create({
        color: post.color,
        content: post.content,
        timestamp: friendlyTimeToTimestamp(post.timestamp),
      })
      .link({ author: userId });

    // Create multiple likes for the posts based on the count in the mock data
    const likes = Array.from({ length: post.likes }, () =>
      adminDb.tx.likes[id()]
        .create({ postId })
        .link({ post: postId, user: userId }),
    );

    // Create post along with its user, profile, and likes in a single
    // transaction
    adminDb.transact([user, profile, postEntity, ...likes]);
  });
}
```

We can also reset the database with a simple script:

<file label="scripts/reset.ts"></file>

```tsx
async function reset() {
  console.log('Resetting database...');
  // Deleting all users will cascade delete all related data (posts, likes,
  // etc.)
  const { $users } = await adminDb.query({ $users: {} });
  adminDb.transact($users.map((user) => adminDb.tx.$users[user.id].delete()));
}
```

This will be it for the Admin SDK usage in this app, but you can learn more
about what else you can do in our [Admin SDK docs](/docs/backend).

## Integrating Auth

In this app we'll leverage Instant's magic code auth to enable users to sign up
and log in via email.

We can detect whether a user is logged in by using the `db.useAuth` hook:

<file label="src/app/page.tsx"></file>

```tsx
const { user, isLoading: userLoading, error: userError } = db.useAuth();
```

If `user` is defined, then the user is logged in. Otherwise they are logged out.
When they're logged out we'll present them with a login flow:

<file label="src/app/page.tsx"></file>

```tsx
function Login() {
  const [sentEmail, setSentEmail] = useState('');
  return (
    <div className="flex items-center justify-center">
      <div className="max-w-sm">
        {!sentEmail ? (
          <EmailStep onSendEmail={setSentEmail} />
        ) : (
          <CodeStep sentEmail={sentEmail} />
        )}
      </div>
    </div>
  );
}
```

First the user enters their email and on submit we'll send them a code:

<file label="src/app/page.tsx"></file>

```tsx
// Most of EmailStep is just form handling UI code, but the important part is
// where we call `db.auth.sendMagicCode` to send the code to the user's email
db.auth.sendMagicCode({ email });
```

And then we verify and log them in when they enter the code:

<file label="src/app/page.tsx"></file>

```tsx
// Similarly in CodeStep the important part is where we verify the code with
// provided email. If this is successful the user will be logged in.
db.auth.signInWithMagicCode({ email: sentEmail, code });
```

That's pretty much all there is to integrating auth with Instant! Aside from
magic code auth, Instant also supports login with Google, Apple,
and more. Check out our [auth docs](/docs/auth) to learn more about the options
we support!

## Adding profiles

Once a user logs in we want to fetch their associated profile.

<file label="src/app/page.tsx"></file>

```tsx
function useProfile(userId: string | undefined) {
  const { data, isLoading, error } = db.useQuery(
    userId
      ? {
          profiles: {
            $: { where: { 'user.id': userId } },
          },
        }
      : null,
  );
  const profile = data?.profiles?.[0];

  return { profile, isLoading, error };
}
```

Here we make a custom hook `useProfile` that takes in a `userId` and queries for
the profile associated with that user
[via a `where` clause](/docs/instaql#fetch-a-specific-entity).

We also defer this query and force `isLoading` to be true until we have a valid
userId (no reason to fetch a profile if someone is not logged in).
You can learn more about [deferred queries](/docs/instaql#defer-queries) in
our docs.

If the user does not have a profile yet (for example if they just signed up), we
prompt them to create one via a simple form in our `SetupProfile` component. On
submission we try to create the profile and show a helpful error message if the
username is already taken.

<file label="src/app/page.tsx"></file>

```tsx
// Transacts are async and optimistic by default, but we can `await` them for
// blocking behavior and error handling
async function createProfile(
  userId: string,
  displayName: string,
  handle: string,
) {
  await db.transact(
    db.tx.profiles[userId]
      .create({
        displayName: displayName.trim(),
        handle: handle.trim().toLowerCase(),
      })
      .link({ user: userId }),
  );
}

const handleCreateProfile = async (displayName: string, handle: string) => {
  try {
    await createProfile(currentUserId, displayName, handle);
  } catch (error: any) {
    // Handle unique constraint violation for handle
    if (error?.body?.type === 'record-not-unique') {
      alert('Handle already taken, please choose another one.');
      return;
    }
    alert('Error creating profile: ' + error.message);
  }
};
```

Once the profile is created our profile query will automatically update and our
app will render the compose UI for creating posts.

## Fin

And with this we have a fully functioning microblog app with user auth,
profiles, posts, and likes! You also got to learn a few more advanced features
around querying, linking, and using the Admin SDK. Huzzah! If you haven't
already, check out the [chat example](/examples/chat) to also learn more advanced presence
features.
