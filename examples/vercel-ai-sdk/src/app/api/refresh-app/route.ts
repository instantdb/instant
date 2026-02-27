import { refreshPreviewAppIfNeeded } from '@/lib/refreshPreviewApp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { chatId } = body as { chatId?: string };

  if (!chatId) {
    return Response.json({ error: 'Missing chatId.' }, { status: 400 });
  }

  const appId = await refreshPreviewAppIfNeeded(chatId);

  if (!appId) {
    return Response.json({ error: 'Chat not found.' }, { status: 404 });
  }

  return Response.json({ appId });
}
