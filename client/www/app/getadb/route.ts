export const runtime = 'nodejs';

export async function GET() {
  return new Response(LANDING_MARKDOWN, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

const LANDING_MARKDOWN = `This is Instant's get-a-db service.

To provision credentials, fetch https://getadb.com/provision/<generate-a-random-16-char-token>.

Generate a random 16-character alphanumeric token yourself and use a
different token each time. The unique URL prevents upstream caches (e.g.
WebFetch's 15-minute URL cache) from serving stale credentials.
`;
