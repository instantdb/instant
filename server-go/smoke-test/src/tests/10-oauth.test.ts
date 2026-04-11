/** OAuth smoke tests. */
import { describe, it, expect } from '../framework.js';
import { get, TestApp } from '../helpers.js';

export async function oauthTests(app: TestApp) {
  await describe('OAuth', async () => {
    await it('start OAuth: returns authorization URL for Google', async () => {
      const data = await get(
        `/admin/oauth/start?app_id=${app.id}&provider=google&redirect_url=http://localhost:3000/callback&client_id=test-client-id`,
      );
      expect(data.url).toBeDefined();
      expect(data.url).toContain('accounts.google.com');
      expect(data.url).toContain('test-client-id');
      expect(data.state).toBeDefined();
    });

    await it('start OAuth: returns authorization URL for GitHub', async () => {
      const data = await get(
        `/admin/oauth/start?app_id=${app.id}&provider=github&redirect_url=http://localhost:3000/callback&client_id=gh-client-id`,
      );
      expect(data.url).toContain('github.com');
      expect(data.state).toBeDefined();
    });

    await it('start OAuth: rejects unsupported provider', async () => {
      const data = await get(
        `/admin/oauth/start?app_id=${app.id}&provider=myspace&redirect_url=http://localhost:3000/callback&client_id=x`,
      );
      expect(data.error).toBeTruthy();
    });

    await it('OAuth callback: validates state parameter', async () => {
      // First start an OAuth flow to get a valid state
      const startData = await get(
        `/admin/oauth/start?app_id=${app.id}&provider=google&redirect_url=http://localhost:3000/callback&client_id=test`,
      );

      // Callback with valid state
      const callbackData = await get(
        `/admin/oauth/callback?state=${startData.state}&code=test-auth-code`,
      );
      expect(callbackData['app-id']).toBe(app.id);
      expect(callbackData.provider).toBe('google');
      expect(callbackData.code).toBe('test-auth-code');
    });

    await it('OAuth callback: rejects invalid state', async () => {
      const data = await get(
        `/admin/oauth/callback?state=invalid-state&code=test-code`,
      );
      expect(data.error).toBeTruthy();
    });
  });
}
