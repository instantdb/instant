/** Authentication smoke tests. */
import { describe, it, expect } from '../framework.js';
import { post, adminHeaders, connectWS, wsInit, TestApp } from '../helpers.js';

export async function authTests(app: TestApp) {
  await describe('Authentication', async () => {
    await it('magic code: send returns code', async () => {
      const data = await post('/admin/magic-code/send', {
        'app-id': app.id,
        email: 'magic@test.com',
      });
      expect(data.sent).toBe(true);
      expect(data.code).toBeDefined();
    });

    await it('magic code: verify creates user and returns token', async () => {
      const sendData = await post('/admin/magic-code/send', {
        'app-id': app.id,
        email: 'verify@test.com',
      });

      const verifyData = await post('/admin/magic-code/verify', {
        'app-id': app.id,
        email: 'verify@test.com',
        code: sendData.code,
      });

      expect(verifyData.user).toBeDefined();
      expect(verifyData.user.email).toBe('verify@test.com');
      expect(verifyData.token).toBeDefined();
      expect(verifyData.user.refresh_token).toBeDefined();
    });

    await it('magic code: reuse fails', async () => {
      const sendData = await post('/admin/magic-code/send', {
        'app-id': app.id,
        email: 'reuse@test.com',
      });

      await post('/admin/magic-code/verify', {
        'app-id': app.id,
        email: 'reuse@test.com',
        code: sendData.code,
      });

      const reuse = await post('/admin/magic-code/verify', {
        'app-id': app.id,
        email: 'reuse@test.com',
        code: sendData.code,
      });

      expect(reuse.error).toBeTruthy();
    });

    await it('guest auth: creates anonymous user', async () => {
      const data = await post('/admin/sign-in-as-guest', { 'app-id': app.id });
      expect(data.user).toBeDefined();
      expect(data.user.is_guest).toBe(true);
      expect(data.token).toBeDefined();
    });

    await it('custom auth token: create by email', async () => {
      const data = await post('/admin/custom-auth-token', {
        email: 'custom@test.com',
      }, adminHeaders(app));
      expect(data.token).toBeDefined();
    });

    await it('WS init with admin token succeeds', async () => {
      const ws = await connectWS(app.id);
      const { sessionId, attrs } = await wsInit(ws, app);
      expect(sessionId).toBeDefined();
      expect(attrs.length).toBeGreaterThan(0);
      ws.close();
    });

    await it('WS init with refresh token authenticates user', async () => {
      const sendData = await post('/admin/magic-code/send', {
        'app-id': app.id,
        email: 'wsauth@test.com',
      });
      const verifyData = await post('/admin/magic-code/verify', {
        'app-id': app.id,
        email: 'wsauth@test.com',
        code: sendData.code,
      });

      const ws = await connectWS(app.id);
      const eventId = crypto.randomUUID();
      ws.send(JSON.stringify({
        op: 'init',
        'app-id': app.id,
        'refresh-token': verifyData.user.refresh_token,
        'client-event-id': eventId,
      }));

      const msg = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
        ws.on('message', (data) => {
          const m = JSON.parse(data.toString());
          if (m.op === 'init-ok') {
            clearTimeout(timeout);
            resolve(m);
          }
        });
      });

      expect(msg.auth.user.email).toBe('wsauth@test.com');
      ws.close();
    });
  });
}
