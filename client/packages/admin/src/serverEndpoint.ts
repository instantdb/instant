import { init } from './index.ts';

export const createInstantRouteHandler = (config: {
  adminToken: string;
  appId: string;
  apiURI?: string;
}) => {
  const admin = init({
    appId: config.appId,
    adminToken: config.adminToken,
    apiURI: config.apiURI,
  });

  async function handleUserSync(req: Request) {
    const body = await req.json();
    if (!body.user) {
      return new Response('Invalid request', { status: 400 });
    }
    const user = await admin.auth.verifyToken(body.user['refresh_token']);
    if (user) {
      return new Response('sync', {
        headers: {
          // 24 hour expiry
          'Set-Cookie': `instant_refresh_token=${user.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,
        },
      });
    } else {
      return new Response('sync', {
        headers: {
          // remove the cookie (some browsers)
          'Set-Cookie': `instant_refresh_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=-1`,
        },
      });
    }
  }

  return {
    GET: async (_req: Request) => {
      return new Response('Method not allowed', {
        status: 405,
        statusText: 'Method Not Allowed',
      });
    },
    POST: async (req: Request) => {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const route = pathname.split('/')[pathname.split('/').length - 1];
      switch (route) {
        case 'sync-auth':
          return await handleUserSync(req);
      }
      return new Response('Route not found', {
        status: 404,
      });
    },
  };
};
