import { agentMarkdownResponse } from './markdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const headers = Object.fromEntries(request.headers.entries());
  console.log('[getadb] request headers', JSON.stringify(headers));
  return agentMarkdownResponse(request);
}
