import type { User } from './clientTypes.js';

type CreateRouteHandlerConfig = {
  appId: string;
};

function createUserSyncResponse(
  config: CreateRouteHandlerConfig,
  user: User | null,
) {
  if (user && user.refresh_token) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        // 7 day expiry
        'Set-Cookie': `instant_user_${config.appId}=${JSON.stringify(user)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
      },
    });
  } else {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        // remove the cookie (some browsers)
        'Set-Cookie': `instant_user_${config.appId}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=-1`,
      },
    });
  }
}

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const createInstantRouteHandler = (config: CreateRouteHandlerConfig) => {
  return {
    POST: async (req: Request) => {
      let body: { type?: string; appId?: string; user?: User | null };
      try {
        body = await req.json();
      } catch {
        return errorResponse(400, 'Invalid JSON body');
      }

      if (!body.type) {
        return errorResponse(400, 'Missing "type" field');
      }

      if (body.appId !== config.appId) {
        return errorResponse(403, 'App ID mismatch');
      }

      switch (body.type) {
        case 'sync-user':
          return createUserSyncResponse(config, body.user ?? null);
        default:
          return errorResponse(400, `Unknown type: ${body.type}`);
      }
    },
  };
};
