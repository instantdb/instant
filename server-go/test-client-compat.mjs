/**
 * Client SDK Compatibility Test
 *
 * Tests the Go backend against the exact WebSocket protocol that
 * the @instantdb/core client SDK uses. Simulates the full client
 * flow: init, query, transact, presence.
 */

import WebSocket from 'ws';

const API_URI = 'http://localhost:8888';
const WS_URI = 'ws://localhost:8888/runtime/session';
const APP_ID = '3e2d1582-ac5d-4bf1-90e4-6f7f7ff1b8e9';
const ADMIN_TOKEN = '132262de-d6b2-48b6-bfe8-226c7cda039b';

let passed = 0;
let failed = 0;
let total = 0;

function pass(name) {
  passed++;
  console.log(`  \x1b[32mPASS\x1b[0m: ${name}`);
}

function fail(name, err) {
  failed++;
  console.log(`  \x1b[31mFAIL\x1b[0m: ${name} - ${err}`);
}

function uuid() {
  return crypto.randomUUID();
}

// Send a JSON message over WebSocket
function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

// Wait for a message matching a predicate
function waitForMsg(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error('Timeout waiting for message'));
    }, timeoutMs);

    function handler(data) {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

// ---- Admin API tests ----
async function testAdminAPI() {
  console.log('\n--- Admin REST API Tests ---');
  total += 5;

  // Health check
  try {
    const resp = await fetch(`${API_URI}/health`);
    const data = await resp.json();
    if (data.status === 'ok') pass('Admin: health check');
    else fail('Admin: health check', `status=${data.status}`);
  } catch (e) {
    fail('Admin: health check', e.message);
  }

  // Get schema
  try {
    const resp = await fetch(`${API_URI}/admin/schema?app_id=${APP_ID}`, {
      headers: { 'app-id': APP_ID, 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await resp.json();
    if (data.attrs && data.attrs.length > 0) {
      pass(`Admin: get schema (${data.attrs.length} attrs)`);
    } else {
      fail('Admin: get schema', 'no attrs returned');
    }
  } catch (e) {
    fail('Admin: get schema', e.message);
  }

  // Query (empty)
  try {
    const resp = await fetch(`${API_URI}/admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app-id': APP_ID,
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ query: { todos: {} } }),
    });
    const data = await resp.json();
    if (data.todos !== undefined) {
      pass(`Admin: query todos (${Array.isArray(data.todos) ? data.todos.length : '?'} results)`);
    } else {
      fail('Admin: query todos', JSON.stringify(data));
    }
  } catch (e) {
    fail('Admin: query todos', e.message);
  }

  // Transact via admin API
  const todoId = uuid();
  try {
    // First we need attr IDs - get them from schema
    const schemaResp = await fetch(`${API_URI}/admin/schema?app_id=${APP_ID}`, {
      headers: { 'app-id': APP_ID, 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const schemaData = await schemaResp.json();
    const attrs = schemaData.attrs || [];

    const idAttr = attrs.find(a => a['forward-identity'][1] === 'todos' && a['forward-identity'][2] === 'id');
    const titleAttr = attrs.find(a => a['forward-identity'][1] === 'todos' && a['forward-identity'][2] === 'text');
    const doneAttr = attrs.find(a => a['forward-identity'][1] === 'todos' && a['forward-identity'][2] === 'done');

    if (!idAttr || !titleAttr || !doneAttr) {
      fail('Admin: transact', 'missing attrs for todos');
    } else {
      const resp = await fetch(`${API_URI}/admin/transact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'app-id': APP_ID,
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          steps: [
            ['add-triple', todoId, idAttr.id, todoId],
            ['add-triple', todoId, titleAttr.id, 'Admin API text'],
            ['add-triple', todoId, doneAttr.id, false],
          ],
        }),
      });
      const data = await resp.json();
      if (data.status === 'ok') {
        pass('Admin: transact (add todo)');
      } else {
        fail('Admin: transact', JSON.stringify(data));
      }
    }
  } catch (e) {
    fail('Admin: transact', e.message);
  }

  // Query after transact
  try {
    const resp = await fetch(`${API_URI}/admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app-id': APP_ID,
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ query: { todos: {} } }),
    });
    const data = await resp.json();
    const todos = data.todos || [];
    if (todos.length >= 1) {
      pass(`Admin: query after transact (${todos.length} todos)`);
    } else {
      fail('Admin: query after transact', `expected >= 1, got ${todos.length}`);
    }
  } catch (e) {
    fail('Admin: query after transact', e.message);
  }
}

// ---- WebSocket protocol tests ----
async function testWebSocket() {
  console.log('\n--- WebSocket Protocol Tests ---');
  total += 9;

  const ws = new WebSocket(`${WS_URI}?app_id=${APP_ID}`);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
  pass('WS: connect');

  // Test: init
  const initEventId = uuid();
  send(ws, {
    op: 'init',
    'app-id': APP_ID,
    '__admin-token': ADMIN_TOKEN,
    'client-event-id': initEventId,
    versions: { '@instantdb/core': '0.22.75' },
  });

  const initResp = await waitForMsg(ws, m => m.op === 'init-ok');
  if (initResp['session-id'] && initResp['client-event-id'] === initEventId) {
    pass('WS: init-ok received');
  } else {
    fail('WS: init-ok', JSON.stringify(initResp));
  }

  const sessionId = initResp['session-id'];

  // Check that attrs are returned
  if (initResp.attrs && (Array.isArray(initResp.attrs) ? initResp.attrs.length > 0 : Object.keys(initResp.attrs).length > 0)) {
    pass(`WS: init returns attrs`);
  } else {
    fail('WS: init returns attrs', `attrs: ${JSON.stringify(initResp.attrs)?.slice(0, 100)}`);
  }

  // Test: add-query
  const queryEventId = uuid();
  send(ws, {
    op: 'add-query',
    q: { todos: {} },
    'client-event-id': queryEventId,
  });

  const queryResp = await waitForMsg(ws, m => (m.op === 'q-ok' || m.op === 'add-query-ok') && m['client-event-id'] === queryEventId);
  if (queryResp.result !== undefined) {
    // Result is now InstaQL tree format (array of nodes with datalog-result)
    const isTree = Array.isArray(queryResp.result);
    pass(`WS: add-query returns results (tree format: ${isTree})`);
  } else {
    fail('WS: add-query', JSON.stringify(queryResp).slice(0, 200));
  }

  // Test: transact (add a todo)
  // We need the attr IDs from init response
  const attrs = Array.isArray(initResp.attrs) ? initResp.attrs : Object.values(initResp.attrs || {});
  const idAttr = attrs.find(a => {
    const fwd = a['forward-identity'];
    return fwd && fwd[1] === 'todos' && fwd[2] === 'id';
  });
  const titleAttr = attrs.find(a => {
    const fwd = a['forward-identity'];
    return fwd && fwd[1] === 'todos' && fwd[2] === 'text';
  });
  const doneAttr = attrs.find(a => {
    const fwd = a['forward-identity'];
    return fwd && fwd[1] === 'todos' && fwd[2] === 'done';
  });

  const newTodoId = uuid();
  const txEventId = uuid();
  const attrId = (a) => a.id || a.ID;

  if (!idAttr || !titleAttr || !doneAttr) {
    console.log('  DEBUG attrs count:', attrs.length, 'idAttr:', !!idAttr, 'titleAttr:', !!titleAttr, 'doneAttr:', !!doneAttr);
    if (attrs.length > 0) console.log('  DEBUG sample:', JSON.stringify(attrs[0]).slice(0, 200));
  }
  if (idAttr && titleAttr && doneAttr) {
    send(ws, {
      op: 'transact',
      'tx-steps': [
        ['add-triple', newTodoId, attrId(idAttr), newTodoId],
        ['add-triple', newTodoId, attrId(titleAttr), 'WS transact text'],
        ['add-triple', newTodoId, attrId(doneAttr), false],
      ],
      'client-event-id': txEventId,
    });

    const txResp = await waitForMsg(ws, m => m.op === 'transact-ok' && m['client-event-id'] === txEventId);
    if (txResp.op === 'transact-ok') {
      pass('WS: transact-ok received');
    } else {
      fail('WS: transact', JSON.stringify(txResp));
    }
  } else {
    fail('WS: transact', 'Could not find todo attrs in init response');
  }

  // Test: join-room
  const joinEventId = uuid();
  send(ws, {
    op: 'join-room',
    'room-id': 'test-room',
    'peer-id': 'peer-1',
    'client-event-id': joinEventId,
  });

  const joinResp = await waitForMsg(ws, m => m.op === 'join-room-ok');
  if (joinResp['room-id'] === 'test-room') {
    pass('WS: join-room-ok');
  } else {
    fail('WS: join-room', JSON.stringify(joinResp));
  }

  // Test: set-presence
  const presEventId = uuid();
  send(ws, {
    op: 'set-presence',
    'room-id': 'test-room',
    data: { cursor: { x: 100, y: 200 } },
    'client-event-id': presEventId,
  });

  const presResp = await waitForMsg(ws, m => m.op === 'set-presence-ok');
  if (presResp.op === 'set-presence-ok') {
    pass('WS: set-presence-ok');
  } else {
    fail('WS: set-presence', JSON.stringify(presResp));
  }

  // Test: leave-room
  const leaveEventId = uuid();
  send(ws, {
    op: 'leave-room',
    'room-id': 'test-room',
    'client-event-id': leaveEventId,
  });

  const leaveResp = await waitForMsg(ws, m => m.op === 'leave-room-ok');
  if (leaveResp.op === 'leave-room-ok') {
    pass('WS: leave-room-ok');
  } else {
    fail('WS: leave-room', JSON.stringify(leaveResp));
  }

  ws.close();
}

// ---- Multi-client reactive test ----
async function testReactive() {
  console.log('\n--- Reactive / Multi-Client Tests ---');
  total += 2;

  // Connect two WebSocket clients
  const ws1 = new WebSocket(`${WS_URI}?app_id=${APP_ID}`);
  const ws2 = new WebSocket(`${WS_URI}?app_id=${APP_ID}`);

  await Promise.all([
    new Promise((resolve, reject) => { ws1.on('open', resolve); ws1.on('error', reject); }),
    new Promise((resolve, reject) => { ws2.on('open', resolve); ws2.on('error', reject); }),
  ]);

  // Init both
  send(ws1, { op: 'init', 'app-id': APP_ID, '__admin-token': ADMIN_TOKEN, 'client-event-id': 'init1' });
  send(ws2, { op: 'init', 'app-id': APP_ID, '__admin-token': ADMIN_TOKEN, 'client-event-id': 'init2' });

  const init1 = await waitForMsg(ws1, m => m.op === 'init-ok');
  const init2 = await waitForMsg(ws2, m => m.op === 'init-ok');

  // Both join same room
  send(ws1, { op: 'join-room', 'room-id': 'collab-room', 'peer-id': 'p1', 'client-event-id': 'jr1' });
  await waitForMsg(ws1, m => m.op === 'join-room-ok');

  send(ws2, { op: 'join-room', 'room-id': 'collab-room', 'peer-id': 'p2', 'client-event-id': 'jr2' });
  await waitForMsg(ws2, m => m.op === 'join-room-ok');

  // Client 1 broadcasts to room
  send(ws1, {
    op: 'client-broadcast',
    'room-id': 'collab-room',
    topic: 'cursor-move',
    data: { x: 42, y: 84 },
    'peer-id': 'p1',
    'client-event-id': 'bc1',
  });

  // Client 2 should receive the broadcast
  try {
    const broadcast = await waitForMsg(ws2, m => m.op === 'server-broadcast' && m.topic === 'cursor-move', 3000);
    if (broadcast.data && broadcast.data.x === 42) {
      pass('Reactive: client broadcast received by peer');
    } else {
      fail('Reactive: client broadcast', JSON.stringify(broadcast));
    }
  } catch (e) {
    fail('Reactive: client broadcast', e.message);
  }

  // Client 1 sets presence, client 2 gets refresh-presence
  send(ws1, {
    op: 'set-presence',
    'room-id': 'collab-room',
    data: { status: 'typing' },
    'client-event-id': 'sp1',
  });

  try {
    const presRefresh = await waitForMsg(ws2, m => m.op === 'refresh-presence', 3000);
    if (presRefresh.data) {
      pass('Reactive: presence update received by peer');
    } else {
      fail('Reactive: presence update', JSON.stringify(presRefresh));
    }
  } catch (e) {
    fail('Reactive: presence update', e.message);
  }

  ws1.close();
  ws2.close();
}

// ---- Magic code auth test ----
async function testAuth() {
  console.log('\n--- Auth Tests ---');
  total += 3;

  // Send magic code
  try {
    const resp = await fetch(`${API_URI}/admin/magic-code/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'app-id': APP_ID, email: 'test@example.com' }),
    });
    const data = await resp.json();
    if (data.sent && data.code) {
      pass(`Auth: magic code sent (code: ${data.code})`);

      // Verify magic code
      const verifyResp = await fetch(`${API_URI}/admin/magic-code/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'app-id': APP_ID, email: 'test@example.com', code: data.code }),
      });
      const verifyData = await verifyResp.json();
      if (verifyData.user && verifyData.user.email === 'test@example.com') {
        pass('Auth: magic code verified, user created');
      } else {
        fail('Auth: magic code verify', JSON.stringify(verifyData));
      }

      // Connect with refresh token
      if (verifyData.user && verifyData.user.refresh_token) {
        const ws = new WebSocket(`${WS_URI}?app_id=${APP_ID}`);
        await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

        send(ws, {
          op: 'init',
          'app-id': APP_ID,
          'refresh-token': verifyData.user.refresh_token,
          'client-event-id': 'auth-init',
        });

        const initResp = await waitForMsg(ws, m => m.op === 'init-ok');
        if (initResp.auth && initResp.auth.user && initResp.auth.user.email === 'test@example.com') {
          pass('Auth: WS init with refresh token');
        } else {
          fail('Auth: WS init with refresh token', JSON.stringify(initResp.auth));
        }
        ws.close();
      } else {
        fail('Auth: WS init with refresh token', 'no refresh token in response');
      }
    } else {
      fail('Auth: magic code send', JSON.stringify(data));
    }
  } catch (e) {
    fail('Auth: magic code flow', e.message);
  }
}

// ---- Run all tests ----
async function main() {
  console.log('=== InstantDB Go Backend - Client SDK Compatibility Tests ===');
  console.log(`Server: ${API_URI}`);
  console.log(`WebSocket: ${WS_URI}`);
  console.log(`App ID: ${APP_ID}`);

  try {
    await testAdminAPI();
    await testWebSocket();
    await testReactive();
    await testAuth();
  } catch (e) {
    console.error('Test runner error:', e);
  }

  console.log('\n=== Summary ===');
  console.log(`  Total:  ${total}`);
  console.log(`  Passed: \x1b[32m${passed}\x1b[0m`);
  console.log(`  Failed: \x1b[31m${failed}\x1b[0m`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
