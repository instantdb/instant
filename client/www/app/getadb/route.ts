import { agentMarkdownResponse } from './markdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return agentMarkdownResponse(request);
}
