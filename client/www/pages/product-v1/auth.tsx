import { ProductPage } from '@/components/productPageUi';
import {
  EnvelopeIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

export default function Auth() {
  return (
    <ProductPage
      slug="auth"
      name="Auth"
      description="Instant comes with a built-in auth system. Add user accounts and social logins easily. Because auth is integrated with your database, you can create relations between users, their data, and permissions. Only allow users to see their own data, or let any member of a team view and edit shared data. Permissions use CEL, a powerful expression language originally developed by Google."
      headline="Auth that understands your data"
      codeExample={`// Send a magic code
db.auth.sendMagicCode({ email: "alyssa@example.com" });

// Verify and sign in
db.auth.signInWithMagicCode({ email, code });

// Or use Google OAuth
db.auth.signInWithRedirect({ clientName: "google" });

// Access the current user
const { user } = db.useAuth();

// Permissions in your schema
const rules = {
  todos: {
    allow: {
      view: "auth.id == data.ownerId",
      create: "auth.id != null",
    },
  },
};`}
      sectionHeading="Authentication and permissions, built in"
      tabs={[
        {
          heading: 'Magic codes and OAuth in a few lines',
          description:
            'Add user accounts with email magic codes or social logins like Google. No separate auth service to configure. Users are created and managed alongside your data.',
          code: `// Send a magic code
db.auth.sendMagicCode({
  email: "alyssa@example.com",
});

// Verify and sign in
db.auth.signInWithMagicCode({ email, code });

// Or use Google OAuth
db.auth.signInWithRedirect({
  clientName: "google",
});

// Access the current user
const { user } = db.useAuth();`,
        },
        {
          heading: 'Row-level security with CEL expressions',
          description:
            'Permissions are expressed in CEL, a powerful expression language developed by Google. Write rules that reference the current user, the data being accessed, and relations between them. Easy for humans and LLMs to read and write.',
          code: `// Permissions in your schema
const rules = {
  todos: {
    allow: {
      // Only the owner can view their todos
      view: "auth.id == data.ownerId",
      // Any logged-in user can create
      create: "auth.id != null",
      // Only the owner can update
      update: "auth.id == data.ownerId",
    },
  },
};`,
        },
        {
          heading: 'Test permissions with different user contexts',
          description:
            'Instant comes with tools to test queries and transactions with different user contexts. Verify that your auth rules work as expected before deploying.',
          code: `// Test as a specific user
const { data } = await db.query(
  { todos: {} },
  { asUser: { id: userId } }
);

// Test as an anonymous user
const { data: publicData } = await db.query(
  { posts: {} },
  { asUser: null }
);

// Verify permission denied
// throws if user lacks access`,
        },
      ]}
      featureCards={[
        {
          icon: EnvelopeIcon,
          title: 'Magic codes and OAuth',
          description:
            'Email magic codes and Google OAuth out of the box. No third-party auth service needed.',
        },
        {
          icon: ShieldCheckIcon,
          title: 'CEL-based permissions',
          description:
            'Permissions use CEL, a powerful expression language from Google. Clear, concise, and easy for LLMs to generate.',
        },
        {
          icon: UsersIcon,
          title: 'Integrated with your data',
          description:
            'Auth is part of your database. Create relations between users, their data, and teams without glue code.',
        },
      ]}
    />
  );
}
