export const createInstantRouteHandler = (config: { appId: string }) => {
  async function handleUserSync(req: Request) {
    const body = await req.json();
    if (body.user && body.user.refresh_token) {
      return new Response('sync', {
        headers: {
          // 7 day expiry
          'Set-Cookie': `instant_user_${config.appId}=${JSON.stringify(body.user)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      });
    } else {
      return new Response('sync', {
        headers: {
          // remove the cookie (some browsers)
          'Set-Cookie': `instant_user_${config.appId}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=-1`,
        },
      });
    }
  }

  return {
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
