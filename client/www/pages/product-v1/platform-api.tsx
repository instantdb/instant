import { ProductPage } from '@/components/productPageUi';
import {
  BoltIcon,
  SparklesIcon,
  CubeTransparentIcon,
} from '@heroicons/react/24/outline';

export default function PlatformApi() {
  return (
    <ProductPage
      slug="platform-api"
      name="Platform API"
      description="Instant offers a platform API that lets you programmatically spin up databases. Give every chat its own backend, build app-builders, or let every employee create internal tools. When you combine a multi-tenant database with a platform SDK, you get infrastructure that lets agents and humans create backends on the fly."
      headline="A backend for every app, agent, and employee"
      codeExample={`import { Platform } from "@instantdb/platform";

const platform = Platform({
  apiToken: process.env.PLATFORM_TOKEN,
});

// Spin up a new database in < 100ms
const app = await platform.apps.create({
  title: "Agent Chat #42",
});

// Each agent gets its own backend
const db = init({ appId: app.id });

// Define schema programmatically
await platform.apps.updateSchema(app.id, {
  entities: {
    messages: { attrs: { text: "string" } },
  },
});`}
      sectionHeading="Programmatic infrastructure for builders"
      tabs={[
        {
          heading: 'Spin up databases in under 100ms',
          description:
            'The Platform API lets you create new Instant databases programmatically. Each app gets its own isolated database, schema, and permissions. Provision backends as fast as you can make API calls.',
          code: `import { Platform } from "@instantdb/platform";

const platform = Platform({
  apiToken: process.env.PLATFORM_TOKEN,
});

// Spin up a new database in < 100ms
const app = await platform.apps.create({
  title: "Agent Chat #42",
});

// Each app is fully isolated
const db = init({ appId: app.id });`,
        },
        {
          heading: 'Define schemas programmatically',
          description:
            'Create and update schemas on the fly. Define entities, attributes, and relations through the API. Perfect for app-builders where end users define their own data models.',
          code: `// Define schema programmatically
await platform.apps.updateSchema(app.id, {
  entities: {
    messages: {
      attrs: {
        text: "string",
        sentAt: "number",
      },
    },
    channels: {
      attrs: {
        name: "string",
      },
    },
  },
  links: [
    {
      from: "channels",
      to: "messages",
      has: "many",
    },
  ],
});`,
        },
        {
          heading: 'From AI agents to personal software',
          description:
            'Give every chat its own backend. Build app-builders where users define their own schemas. Let every employee create internal tools. The Platform API makes multi-tenant applications trivial.',
          code: `// AI agent creates its own backend
async function onNewChat(chatId) {
  const app = await platform.apps.create({
    title: \`Chat \${chatId}\`,
  });

  // Agent can now read and write data
  const db = init({ appId: app.id });

  db.transact(
    db.tx.messages[id()].update({
      role: "system",
      content: "How can I help?",
    })
  );

  return app.id;
}`,
        },
      ]}
      featureCards={[
        {
          icon: BoltIcon,
          title: 'Sub-100ms provisioning',
          description:
            'New databases spin up in under 100ms. Create backends as fast as your application needs them.',
        },
        {
          icon: SparklesIcon,
          title: 'Built for AI agents',
          description:
            'Agents and humans can create backends on the fly. Combine with the Admin SDK for full programmatic control.',
        },
        {
          icon: CubeTransparentIcon,
          title: 'Multi-tenant by design',
          description:
            'Each app is fully isolated with its own schema, data, and permissions. Build platforms that scale.',
        },
      ]}
    />
  );
}
