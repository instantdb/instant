export const adminExamples = [
  {
    label: 'Query',
    code: `// Read data with the same InstaQL API
const { data } = await adminDb.query({
  orders: { customer: {} },
});`,
  },
  {
    label: 'Transact',
    code: `// Write data with elevated permissions
await adminDb.transact(
  adminDb.tx.users[userId].update({ role: "admin" })
);

// Or transact on behalf of a user
const scopedDb = adminDb.asUser({ email: "alyssa@example.com" });
await scopedDb.transact(
  scopedDb.tx.todos[id()].update({ title: "Ship feature" })
);`,
  },
  {
    label: 'Subscribe',
    code: `// Listen for real-time changes on the backend
const sub = adminDb.subscribeQuery(
  { tasks: { $: { limit: 10 } } },
  (payload) => {
    if (payload.type === "error") {
      sub.close();
    } else {
      console.log("got data!", payload.data);
    }
  }
);`,
  },
  {
    label: 'Storage',
    code: `// Upload files from the server
const url = await adminDb.storage.uploadFile(
  "invoices/receipt.pdf",
  file
);

// Link the file to your data
await adminDb.transact(
  adminDb.tx.orders[orderId].update({ receiptUrl: url })
);`,
  },
  {
    label: 'Auth',
    code: `// Create tokens for custom auth flows
const token = await adminDb.auth.createToken({ email });

// Retrieve users by email, id, or refresh token
const user = await adminDb.auth.getUser({ email });

// Sign out a user from all sessions
await adminDb.auth.signOut({ email });

// Delete a user
await adminDb.auth.deleteUser({ id: userId });`,
  },
  {
    label: 'Cron',
    code: `// Run scheduled jobs against your database
const { data } = await adminDb.query({
  subscriptions: {
    $: { where: { expiresAt: { $lt: Date.now() } } },
  },
});
for (const sub of data.subscriptions) {
  await adminDb.transact(
    adminDb.tx.subscriptions[sub.id].update({ status: "expired" })
  );
}`,
  },
];

export const httpExamples = [
  {
    label: 'Query',
    code: `# Read data with InstaQL
curl -X POST "https://api.instantdb.com/admin/query" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "App-Id: $APP_ID" \\
  -d '{"query":{"goals":{},"todos":{}}}'`,
  },
  {
    label: 'Transact',
    code: `# Write data with InstaML
curl -X POST "https://api.instantdb.com/admin/transact" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "App-Id: $APP_ID" \\
  -d '{"steps":[["update","todos","<todo-id>",{"title":"Get fit"}]]}'`,
  },
  {
    label: 'Subscribe',
    code: `# Stream real-time updates over SSE
curl -N -X POST "https://api.instantdb.com/admin/subscribe-query" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "App-Id: $APP_ID" \\
  -d '{"query":{"tasks":{}}}'`,
  },
  {
    label: 'Get user',
    code: `# Fetch a user by email, id, or refresh token
curl -X GET "https://api.instantdb.com/admin/users?email=alyssa@instantdb.com" \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "App-Id: $APP_ID"`,
  },
  {
    label: 'Upload',
    code: `# Upload files to Instant Storage
curl -X PUT "https://api.instantdb.com/admin/storage/upload" \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "App-Id: $APP_ID" \\
  -F "file=@photo.png"`,
  },
];
