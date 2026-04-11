/**
 * Instant Go Backend — Full Smoke Test Suite
 *
 * Exercises every feature against the running Go binary:
 *   Admin API, Auth, Queries, Transactions, Presence,
 *   Storage, Streams, Sync Tables, Schema, OAuth
 *
 * Usage:
 *   # Start the server first:
 *   DB_PATH=/tmp/smoke.db ./instant-server &
 *
 *   # Run tests:
 *   cd smoke-test && npm test
 */

import { printResults } from './framework.js';
import { createTestApp, API } from './helpers.js';

import { adminAPITests } from './tests/01-admin-api.test.js';
import { authTests } from './tests/02-auth.test.js';
import { queryTests } from './tests/03-queries.test.js';
import { transactionTests } from './tests/04-transactions.test.js';
import { presenceTests } from './tests/05-presence.test.js';
import { storageTests } from './tests/06-storage.test.js';
import { streamTests } from './tests/07-streams.test.js';
import { syncTests } from './tests/08-sync.test.js';
import { schemaTests } from './tests/09-schema.test.js';
import { oauthTests } from './tests/10-oauth.test.js';

async function main() {
  console.log('');
  console.log('  Instant Go Backend — Smoke Tests');
  console.log('  ================================');
  console.log(`  Server: ${API}`);
  console.log('');

  // Verify server is reachable
  try {
    const resp = await fetch(`${API}/health`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch (e: any) {
    console.error(`  ✗ Server not reachable at ${API}: ${e.message}`);
    console.error('  Start the server first: DB_PATH=/tmp/smoke.db ./instant-server');
    process.exit(1);
  }

  // Create a fresh test app
  const app = await createTestApp();
  console.log(`  App: ${app.id}`);
  console.log(`  Attrs: ${Object.keys(app.attrs).length}`);
  console.log('');

  // Run all test suites
  await adminAPITests(app);
  await authTests(app);
  await queryTests(app);
  await transactionTests(app);
  await presenceTests(app);
  await storageTests(app);
  await streamTests(app);
  await syncTests(app);
  await schemaTests(app);
  await oauthTests(app);

  // Print results
  const allPassed = printResults();
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
