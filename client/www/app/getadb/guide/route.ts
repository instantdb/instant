import { GUIDE_MARKDOWN } from '../guideMarkdown';

export const runtime = 'nodejs';

export async function GET() {
  return new Response(GUIDE_MARKDOWN, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
