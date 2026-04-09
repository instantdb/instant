import schema from '@/lib/intern/docs-feedback/instant.schema';
import { init, id } from '@instantdb/admin';
import { Webhooks } from '@octokit/webhooks';
import { WatchEvent } from '@octokit/webhooks-types';
import { NextRequest, NextResponse } from 'next/server';

const FEEDBACK_API_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_API_URI || 'https://api.instantdb.com';

const getAdminDb = () => {
  if (!process.env.FEEDBACK_ADMIN_TOKEN) {
    throw new Error('FEEDBACK_ADMIN_TOKEN is not set');
  }
  return init({
    appId:
      process.env.NEXT_PUBLIC_FEEDBACK_APP_ID ||
      '5d9c6277-e6ac-42d6-8e51-2354b4870c05',
    schema,
    adminToken: process.env.FEEDBACK_ADMIN_TOKEN,
    apiURI: FEEDBACK_API_URL,
    useDateObjects: true,
  });
};

export async function POST(req: NextRequest) {
  const webhooks = new Webhooks({
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
  });
  const signature = req.headers.get('x-hub-signature-256');
  const eventType = req.headers.get('x-github-event');

  if (eventType !== 'watch') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  const body = await req.text();

  if (!(await webhooks.verify(body, signature))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload: WatchEvent = JSON.parse(body);

  const repoId = payload.repository.id;
  const repoFullName = payload.repository.full_name;
  const stargazersCount = payload.repository.stargazers_count;

  const senderId = payload.sender.id;
  const senderLogin = payload.sender.login;
  const senderType = payload.sender.type;

  const db = getAdminDb();

  await db.transact([
    db.tx.ghStarTotals.lookup('repoId', repoId).update({
      repoFullName,
      stargazersCount,
    }),
    db.tx.ghStarGazers[id()].create({
      repoId,
      repoFullName,
      starredAt: new Date(),
      senderId,
      senderLogin,
      senderType,
    }),
  ]);

  return NextResponse.json({ ok: true });
}
