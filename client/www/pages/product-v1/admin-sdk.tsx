import { ProductPage } from '@/components/productPageUi';
import {
  CodeBracketIcon,
  GlobeAltIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';

export default function AdminSdk() {
  return (
    <ProductPage
      slug="admin-sdk"
      name="Admin SDK"
      description="The Admin SDK lets you use Instant on your backend with elevated permissions. It operates over an HTTP API and provides the same InstaQL and InstaML APIs you use on the client. Use it for crons, scripts, data migrations, server-side rendering, and integrating with third-party APIs like Stripe."
      headline="Instant on your backend"
      codeExample={`import Instant from "@instantdb/admin";

const db = Instant({
  appId: process.env.INSTANT_APP_ID,
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

// Same query API, elevated permissions
const { data } = await db.query({
  users: { profile: {} },
});

// Run transactions server-side
await db.transact(
  db.tx.users[userId].update({ role: "admin" })
);

// Use in API routes, crons, migrations
export async function handler(req, res) {
  const orders = await db.query({ orders: {} });
  await syncToStripe(orders.data);
}`}
      sectionHeading="The same APIs, with elevated permissions"
      tabs={[
        {
          heading: 'InstaQL and InstaML on the server',
          description:
            'The Admin SDK gives you the same query and transaction APIs you use on the client. The difference is elevated permissions, so you can read and write any data without auth restrictions.',
          code: `import Instant from "@instantdb/admin";

const db = Instant({
  appId: process.env.INSTANT_APP_ID,
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

// Same query API, no auth restrictions
const { data } = await db.query({
  users: { profile: {}, orders: {} },
});

// Same transaction API, elevated perms
await db.transact(
  db.tx.users[userId].update({ role: "admin" })
);`,
        },
        {
          heading: 'Use Instant in your API handlers',
          description:
            'The Admin SDK works in any Node.js environment. Use it in Next.js API routes, Express handlers, or any other server framework. Perfect for integrating with third-party services.',
          code: `// Next.js API route
export async function handler(req, res) {
  const { orderId } = req.body;

  // Read from Instant
  const { data } = await db.query({
    orders: {
      $: { where: { id: orderId } },
      items: {},
    },
  });

  // Sync to Stripe
  const charge = await stripe.charges.create({
    amount: data.orders[0].total,
    currency: "usd",
  });

  // Write back to Instant
  await db.transact(
    db.tx.orders[orderId].update({
      stripeChargeId: charge.id,
      status: "paid",
    })
  );
}`,
        },
        {
          heading: 'Crons, migrations, and one-off scripts',
          description:
            'Use the Admin SDK for scheduled jobs, data migrations, and one-off scripts. It operates over HTTP, so you can also use it from any language with a REST client.',
          code: `// Data migration script
const { data } = await db.query({
  users: {},
});

for (const user of data.users) {
  await db.transact(
    db.tx.users[user.id].update({
      displayName: user.name || user.email,
      migratedAt: Date.now(),
    })
  );
}

// Works over HTTP - use from any language
// POST https://api.instantdb.com/admin/query
// Authorization: Bearer <admin-token>`,
        },
      ]}
      featureCards={[
        {
          icon: CodeBracketIcon,
          title: 'Same APIs you know',
          description:
            'InstaQL and InstaML work the same on the server. No new query language to learn for your backend.',
        },
        {
          icon: GlobeAltIcon,
          title: 'HTTP API for any language',
          description:
            'The Admin SDK operates over HTTP. Use the JavaScript SDK or call the REST API from Python, Go, or any language.',
        },
        {
          icon: CalendarIcon,
          title: 'Crons, scripts, and more',
          description:
            'Run scheduled jobs, data migrations, server-side rendering, and third-party integrations.',
        },
      ]}
    />
  );
}
